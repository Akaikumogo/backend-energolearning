import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { AiOutOfScopeQuestion } from '../database/entities/ai-out-of-scope-question.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { Exam } from '../database/entities/exam.entity';
import { Level } from '../database/entities/level.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  GROQ_BASE_URL,
  GROQ_MODEL,
  groqApiKey,
  hasGroqConfig,
} from './ai-chat.config';

export type AiChatScope = 'mobile' | 'admin';
export type AiAudience = 'superadmin' | 'central' | 'branch';

export type AiAccess = {
  audience: AiAudience;
  scopeLabel: string;
  orgIds: string[];
  canReviewOutOfScope: boolean;
};

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  private readonly ctxCache = new Map<string, { at: number; ctx: string }>();
  private readonly ctxTtlMs = 30_000;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(UserLevelCompletion)
    private readonly completionRepo: Repository<UserLevelCompletion>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(ExamAssignment)
    private readonly examAssignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
    @InjectRepository(AiOutOfScopeQuestion)
    private readonly outOfScopeRepo: Repository<AiOutOfScopeQuestion>,
    private readonly organizationsService: OrganizationsService,
  ) {}

  normalizeScope(role: Role | undefined, requestedScope?: string): AiChatScope {
    if (role === Role.USER) return 'mobile';
    if (
      role === Role.MODERATOR ||
      role === Role.SUPERADMIN ||
      role === Role.APPROVER
    ) {
      return requestedScope === 'mobile' ? 'mobile' : 'admin';
    }
    return requestedScope === 'admin' ? 'admin' : 'mobile';
  }

  async describeAccess(
    userId: string,
    role: Role,
    organizationIds: string[] | undefined,
  ): Promise<AiAccess> {
    if (role === Role.SUPERADMIN) {
      const orgs = await this.orgRepo.find({
        where: { archivedAt: IsNull() },
        order: { name: 'ASC' },
      });
      return {
        audience: 'superadmin',
        scopeLabel: 'Barcha tashkilotlar',
        orgIds: orgs.map((org) => org.id),
        canReviewOutOfScope: true,
      };
    }

    const ids = organizationIds ?? [];
    const linked = ids.length
      ? await this.orgRepo.find({ where: { id: In(ids) } })
      : [];
    const central = linked.some((org) => org.isDefault);
    if (central) {
      const own = linked.filter((org) => org.isDefault);
      return {
        audience: 'central',
        scopeLabel: own.map((org) => org.name).join(', ') || 'Markaziy apparat',
        orgIds: own.map((org) => org.id),
        canReviewOutOfScope: true,
      };
    }

    const expanded = ids.length
      ? await this.organizationsService.expandOrgScope(ids)
      : [];
    const orgs = expanded.length
      ? await this.orgRepo.find({
          where: { id: In(expanded), archivedAt: IsNull() },
          order: { name: 'ASC' },
        })
      : [];
    return {
      audience: 'branch',
      scopeLabel: orgs.map((org) => org.name).join(', ') || 'Filial',
      orgIds: orgs.map((org) => org.id),
      canReviewOutOfScope: false,
    };
  }

  async getProviderStatus(
    userId: string,
    role: Role,
    organizationIds: string[] | undefined,
  ) {
    const access = await this.describeAccess(userId, role, organizationIds);
    return {
      provider: 'groq',
      model: GROQ_MODEL,
      ready: hasGroqConfig(),
      audience: access.audience,
      scopeLabel: access.scopeLabel,
      canReviewOutOfScope: access.canReviewOutOfScope,
    };
  }

  async listOutOfScope(
    userId: string,
    role: Role,
    organizationIds: string[] | undefined,
  ) {
    const access = await this.describeAccess(userId, role, organizationIds);
    if (!access.canReviewOutOfScope) {
      throw new ForbiddenException('Bu jurnal faqat markaziy apparat va superadmin uchun');
    }
    const rows = await this.outOfScopeRepo.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return {
      total: rows.length,
      data: rows.map((row) => ({
        id: row.id,
        userName: row.userName,
        userRole: row.userRole,
        audience: row.audience,
        scopeLabel: row.scopeLabel,
        question: row.question,
        createdAt: row.createdAt,
      })),
    };
  }

  async streamReply(args: {
    userId: string;
    role: Role;
    organizationIds: string[] | undefined;
    scope: AiChatScope;
    message: string;
    onChunk: (chunk: string) => void;
  }) {
    if (!hasGroqConfig()) {
      throw new Error('Groq kaliti yo‘q');
    }

    if (args.scope === 'mobile') {
      const ctx = await this.getMobileContextLine(args.userId);
      await this.streamFromGroq({
        system:
          "Sen o'zbekcha gapiradigan ElektroLearn o'quv yordamchisan. Faqat berilgan kontekst bo'yicha javob ber. Kod, server va boshqa mavzularga kirma. ID ko'rsatma.",
        user: `${ctx}\nSAVOL: ${args.message}`,
        onChunk: args.onChunk,
        maxTokens: 500,
      });
      return;
    }

    const access = await this.describeAccess(
      args.userId,
      args.role,
      args.organizationIds,
    );
    const verdict = await this.classifyQuestion(args.message, access.scopeLabel);
    if (verdict === 'OUT') {
      await this.recordOutOfScope(args.userId, args.role, access, args.message);
      const note =
        'Bu savol ElektroLearn doirasida emas. Platforma, filial va xavfsizlik yozuvlaridan tashqari mavzuga javob berilmaydi. Savol markaziy apparat jurnaliga yozildi.';
      args.onChunk(note);
      return;
    }

    const ctx = await this.getAdminContext(access);
    await this.streamFromGroq({
      system: [
        "Sen ElektroLearn tahlilchisisan. O'zbek tilida, qisqa va aniq yoz.",
        "Faqat KONTEKST dagi raqam va faktlardan foydalan. Yo'q narsani o'ylab topma.",
        'Boshqa tashkilot, dastur kodi, server tuzilishi, token yoki tibbiy xulosa haqida gapirma.',
        'Raqamlarni o‘zgartirma. Javobni 2–6 qisqa bandga bo‘l.',
        `Doirang: ${access.scopeLabel}.`,
      ].join(' '),
      user: `${ctx}\nSAVOL: ${args.message}`,
      onChunk: args.onChunk,
        maxTokens: 1200,
    });
  }

  private async classifyQuestion(message: string, scopeLabel: string) {
    if (
      /```|nestjs|typescript|javascript|react\b|sql\b|github|dastur kod|manba kod|qanday yozilgan|algoritm/i.test(
        message,
      )
    ) {
      return 'OUT' as const;
    }
    const text = await this.completeGroq({
      system: [
        "Sen ElektroLearn savol filtrisan. Faqat bitta so'z yoz: IN yoki OUT.",
        "IN — savol shu platforma ichida: kunlik reja, xodim, imtihon, xato savol, reyting, xavfsizlik yozuvi, moderator ishi. Va faqat berilgan tashkilotlar haqida.",
        "OUT — kod, dasturlash, SQL, server, umumiy bilim, yangilik, shaxsiy maslahat, yoki ro'yxatda yo'q tashkilot.",
        `Tashkilotlar: ${scopeLabel}`,
      ].join(' '),
      user: message.slice(0, 2000),
      maxTokens: 24,
    });
    return /\bOUT\b/i.test(text) ? ('OUT' as const) : ('IN' as const);
  }

  private async recordOutOfScope(
    userId: string,
    role: Role,
    access: AiAccess,
    question: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    await this.outOfScopeRepo.save(
      this.outOfScopeRepo.create({
        userId,
        userName: name || user?.email || 'Noma’lum',
        userRole: role,
        audience: access.audience,
        scopeLabel: access.scopeLabel,
        question: question.slice(0, 4000),
      }),
    );
  }

  private async completeGroq(args: {
    system: string;
    user: string;
    maxTokens: number;
  }) {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: args.maxTokens,
        reasoning_effort: 'low',
        stream: false,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? '';
  }

  private async streamFromGroq(args: {
    system: string;
    user: string;
    onChunk: (chunk: string) => void;
    maxTokens: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    let response: Response;
    try {
      response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey()}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: GROQ_MODEL,
          stream: true,
          temperature: 0.2,
          max_tokens: args.maxTokens,
          reasoning_effort: 'low',
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.user },
          ],
        }),
      });
    } catch (error) {
      throw new Error(`Groq ulanish xatosi: ${this.formatFetchError(error)}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`Groq HTTP ${response.status}: ${text.slice(0, 180)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice('data:'.length).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const chunk = parsed.choices?.[0]?.delta?.content ?? '';
          if (chunk) args.onChunk(chunk);
        } catch {
          // yarim qator
        }
      }
    }
  }

  private async getMobileContextLine(userId: string) {
    const key = `mobile:${userId}`;
    const now = Date.now();
    const cached = this.ctxCache.get(key);
    if (cached && now - cached.at < this.ctxTtlMs) return cached.ctx;

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    const org = user?.organizations?.[0]?.organization ?? null;

    const levels = await this.levelRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC' },
    });
    const completions = await this.completionRepo.find({ where: { userId } });
    const completionByLevel = new Map(completions.map((c) => [c.levelId, c]));

    let stage: string = '-';
    for (let idx = 0; idx < levels.length; idx++) {
      const level = levels[idx];
      const completion = completionByLevel.get(level.id);
      const percent = completion?.completionPercent ?? 0;
      const completed = percent >= 100;

      let locked = false;
      if (idx > 0) {
        const prev = levels[idx - 1];
        const prevCompletion = completionByLevel.get(prev.id);
        locked = !prevCompletion || prevCompletion.completionPercent < 100;
      }

      if (!locked && !completed) {
        stage = `${level.orderIndex}:${percent}`;
        break;
      }
      if (!locked && completed) stage = `${level.orderIndex}:100`;
    }

    const correctCount = await this.attemptRepo.count({
      where: { userId, isCorrect: true },
    });
    const totalXp = correctCount * 10;

    const wrongRows: Array<{
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
    }> = await this.attemptRepo.query(
      `
      SELECT q.prompt AS "prompt", l.title AS "levelTitle", t.title AS "theoryTitle"
      FROM user_question_attempts a
      JOIN questions q ON q.id = a.question_id
      JOIN levels l ON l.id = q.level_id
      JOIN theories t ON t.id = q.theory_id
      WHERE a.user_id = $1
        AND a.is_correct = false
      ORDER BY a.answered_at DESC
      LIMIT 30;
      `,
      [userId],
    );
    const wrongDistinct: string[] = [];
    for (const r of wrongRows) {
      const p0 = (r.prompt ?? '').replace(/\s+/g, ' ').trim();
      const lvl = (r.levelTitle ?? '').replace(/\s+/g, ' ').trim();
      const thr = (r.theoryTitle ?? '').replace(/\s+/g, ' ').trim();
      const p = [
        lvl && `Level: ${lvl}`,
        thr && `Mavzu: ${thr}`,
        p0 && `Savol: ${p0}`,
      ]
        .filter(Boolean)
        .join(' | ');
      if (!p) continue;
      if (wrongDistinct.includes(p)) continue;
      wrongDistinct.push(p.length > 80 ? `${p.slice(0, 77)}...` : p);
      if (wrongDistinct.length >= 6) break;
    }

    const exam = await this.examAssignmentRepo.findOne({
      where: [
        { userId, status: ExamAssignmentStatus.SCHEDULED },
        { userId, status: ExamAssignmentStatus.PENDING },
        { userId, status: ExamAssignmentStatus.STARTED },
      ],
      order: { scheduledAt: 'ASC', windowEnd: 'ASC' },
    });

    const examFlag = exam ? 'ha' : 'yoq';
    const examStatus = exam?.status ?? '-';
    const examAt = exam?.scheduledAt ? exam.scheduledAt.toISOString() : '-';
    let examTitle = '-';
    if (exam?.examId) {
      const ex = await this.examRepo.findOne({ where: { id: exam.examId } });
      if (ex?.title) examTitle = ex.title.replace(/\s+/g, ' ').trim();
    }

    const wrongPart = wrongDistinct.length
      ? ` wrong=[${wrongDistinct.map((x) => `"${x.replace(/"/g, "'")}"`).join(',')}]`
      : '';
    const ctx = `CTX: scope=mobile org=${org?.name ?? '-'} xp=${totalXp} stage=${stage} exam=${examFlag} exam_title=${examTitle} exam_status=${examStatus} exam_at=${examAt}${wrongPart}`;
    this.ctxCache.set(key, { at: now, ctx });
    return ctx;
  }

  private async getAdminContext(access: AiAccess) {
    const key = `admin:${access.audience}:${[...access.orgIds].sort().join(',')}`;
    const now = Date.now();
    const cached = this.ctxCache.get(key);
    if (cached && now - cached.at < this.ctxTtlMs) return cached.ctx;

    if (!access.orgIds.length) {
      const empty = `KONTEKST: doira=${access.scopeLabel}. Bu doirada tashkilot biriktirilmagan.`;
      this.ctxCache.set(key, { at: now, ctx: empty });
      return empty;
    }

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const ids = access.orgIds;
    const orgs = await this.orgRepo.find({
      where: { id: In(ids) },
      order: { name: 'ASC' },
    });

    const employees = await this.userOrgRepo.query(
      `
      SELECT uo."organizationId" AS org_id, COUNT(*)::int AS employees
      FROM user_organizations uo
      INNER JOIN users u ON u.id = uo."userId"
      WHERE uo."organizationId" = ANY($1::uuid[])
        AND u.role = 'USER'
      GROUP BY uo."organizationId"
      `,
      [ids],
    );
    const activity = await this.attemptRepo.query(
      `
      SELECT a.organization_id AS org_id,
        COUNT(DISTINCT a.user_id)::int AS people,
        COUNT(*) FILTER (WHERE a.is_correct AND a.counts_for_xp)::int AS plan_correct,
        COUNT(*) FILTER (WHERE a.is_correct = false)::int AS wrong
      FROM user_question_attempts a
      WHERE a.organization_id = ANY($1::uuid[])
        AND a.answered_at >= $2
      GROUP BY a.organization_id
      `,
      [ids, since],
    );
    const wrongs: Array<{ prompt: string; wrong: number }> =
      await this.attemptRepo.query(
        `
        SELECT q.prompt AS prompt, COUNT(*)::int AS wrong
        FROM user_question_attempts a
        JOIN questions q ON q.id = a.question_id
        WHERE a.organization_id = ANY($1::uuid[])
          AND a.is_correct = false
          AND a.answered_at >= $2
        GROUP BY q.id, q.prompt
        ORDER BY wrong DESC
        LIMIT 8
        `,
        [ids, since],
      );
    const risks: Array<{ title: string; total: number; overdue: number }> =
      await this.orgRepo.query(
        `
        SELECT t.title_uz AS title,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (
            WHERE r.next_exam_date IS NOT NULL AND r.next_exam_date < CURRENT_DATE
          )::int AS overdue
        FROM employee_safety_records r
        JOIN safety_record_types t ON t.id = r.record_type_id
        WHERE r.organization_id = ANY($1::uuid[])
          AND r.deleted_at IS NULL
          AND r.archived_at IS NULL
          AND r.is_latest = true
        GROUP BY t.title_uz
        ORDER BY total DESC
        LIMIT 12
        `,
        [ids],
      );
    const struggling: Array<{
      first: string;
      last: string;
      org: string;
      wrong: number;
    }> = await this.attemptRepo.query(
      `
      SELECT u.first_name AS first, u.last_name AS last, o.name AS org, COUNT(*)::int AS wrong
      FROM user_question_attempts a
      JOIN users u ON u.id = a.user_id
      JOIN organizations o ON o.id = a.organization_id
      WHERE a.organization_id = ANY($1::uuid[])
        AND a.is_correct = false
        AND a.answered_at >= $2
      GROUP BY u.id, u.first_name, u.last_name, o.name
      ORDER BY wrong DESC
      LIMIT 8
      `,
      [ids, since],
    );

    const employeesByOrg = new Map(
      employees.map((row: { org_id: string; employees: number }) => [
        row.org_id,
        row.employees,
      ]),
    );
    const activityByOrg = new Map<
      string,
      { people: number; plan_correct: number; wrong: number }
    >(
      activity.map(
        (row: {
          org_id: string;
          people: number;
          plan_correct: number;
          wrong: number;
        }) => [row.org_id, row],
      ),
    );
    const shown = orgs.slice(0, 30);
    const orgLines = shown
      .map((org) => {
        const act = activityByOrg.get(org.id);
        return `- ${org.name}: xodim ${employeesByOrg.get(org.id) ?? 0}, 7 kunda javob bergan ${act?.people ?? 0}, reja bo'yicha to'g'ri ${act?.plan_correct ?? 0}, xato ${act?.wrong ?? 0}`;
      })
      .join('\n');
    const hidden =
      orgs.length > shown.length
        ? `\nYana ${orgs.length - shown.length} ta tashkilot bor, ular bu ro'yxatga sig'madi.`
        : '';
    const wrongLine = wrongs.length
      ? wrongs
          .map((row) => {
            const prompt = (row.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
            return `- ${prompt} (${row.wrong} marta)`;
          })
          .join('\n')
      : '- yo\'q';
    const riskLine = risks.length
      ? risks
          .map(
            (row) =>
              `- ${row.title}: faol yozuv ${row.total}, muddati o'tgan keyingi imtihon ${row.overdue}`,
          )
          .join('\n')
      : '- yo\'q';
    const peopleLine = struggling.length
      ? struggling
          .map((row) => {
            const name = `${row.first ?? ''} ${row.last ?? ''}`.trim() || 'Xodim';
            return `- ${name}, ${row.org}: ${row.wrong} ta xato`;
          })
          .join('\n')
      : '- yo\'q';

    const ctx = [
      `KONTEKST: doira=${access.scopeLabel}. Auditoriya=${access.audience}. Oxirgi 7 kun.`,
      'Tashkilotlar:',
      orgLines || '- yo\'q',
      hidden,
      'Eng ko\'p xato qilingan savollar:',
      wrongLine,
      'Xavfsizlik yozuvlari:',
      riskLine,
      'Ko\'proq xato qilayotgan xodimlar:',
      peopleLine,
    ]
      .filter((line) => line !== '')
      .join('\n');
    this.ctxCache.set(key, { at: now, ctx });
    return ctx;
  }

  private formatFetchError(error: unknown) {
    if (!error) return 'unknown';
    if (error instanceof Error) {
      const cause = error.cause as
        | {
            code?: string;
            errno?: number | string;
            syscall?: string;
            address?: string;
            port?: number;
          }
        | undefined;
      if (cause) {
        return [
          error.name,
          error.message,
          cause.code,
          cause.errno ? `errno=${cause.errno}` : '',
          cause.syscall ? `syscall=${cause.syscall}` : '',
          cause.address ? `address=${cause.address}` : '',
          typeof cause.port === 'number' ? `port=${cause.port}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
      }
      return `${error.name}: ${error.message}`;
    }
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'unknown';
    }
  }
}
