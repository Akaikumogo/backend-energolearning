import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { AiChatMessage } from '../database/entities/ai-chat-message.entity';
import { AiChatSession } from '../database/entities/ai-chat-session.entity';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { Level } from '../database/entities/level.entity';
import { Organization } from '../database/entities/organization.entity';
import { Question } from '../database/entities/question.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Theory } from '../database/entities/theory.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';

export type AiChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

export type AiChatScope = 'mobile' | 'admin';

type StreamReplyArgs = {
  userId: string;
  role: Role;
  organizationIds: string[];
  scope: AiChatScope;
  message: string;
  history: AiChatTurn[];
  onChunk: (chunk: string) => void;
};

type PersistedMessageDto = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

type QueryIntent =
  | 'mistakes'
  | 'progress'
  | 'leaderboard'
  | 'exam'
  | 'employee'
  | 'admin_analytics'
  | 'general';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Level)
    private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory)
    private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(UserLevelCompletion)
    private readonly completionRepo: Repository<UserLevelCompletion>,
    @InjectRepository(ExamAssignment)
    private readonly assignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(EmployeeCertificate)
    private readonly employeeCertificateRepo: Repository<EmployeeCertificate>,
    @InjectRepository(EmployeeCheck)
    private readonly employeeCheckRepo: Repository<EmployeeCheck>,
    @InjectRepository(AiChatSession)
    private readonly sessionRepo: Repository<AiChatSession>,
    @InjectRepository(AiChatMessage)
    private readonly messageRepo: Repository<AiChatMessage>,
    private readonly organizationsService: OrganizationsService,
  ) {}

  normalizeScope(role: Role | undefined, requestedScope?: string): AiChatScope {
    if (role === Role.USER) return 'mobile';
    return requestedScope === 'admin' ? 'admin' : 'mobile';
  }

  async getOrCreateSession(
    userId: string,
    scope: AiChatScope,
  ): Promise<AiChatSession> {
    const existing = await this.sessionRepo.findOne({
      where: { userId, scope },
    });
    if (existing) return existing;

    return this.sessionRepo.save(
      this.sessionRepo.create({
        userId,
        scope,
        title: scope === 'admin' ? 'Admin AI' : 'Mobile AI',
      }),
    );
  }

  async getSessionMessages(sessionId: string, limit = 60) {
    const rows = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    })) as PersistedMessageDto[];
  }

  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    const row = await this.messageRepo.save(
      this.messageRepo.create({
        sessionId,
        role,
        content,
      }),
    );

    await this.sessionRepo.update(sessionId, {
      updatedAt: new Date(),
      title:
        role === 'user'
          ? content.slice(0, 80)
          : undefined,
    });

    return row;
  }

  async streamReply({
    userId,
    role,
    organizationIds,
    scope,
    message,
    history,
    onChunk,
  }: StreamReplyArgs) {
    const intent = this.detectIntent(message, scope, role);
    const context = await this.buildContext({
      userId,
      role,
      organizationIds,
      scope,
      intent,
    });
    const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5-coder:7b';
    const baseUrl =
      process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434';
    const requestUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;
    const controller = new AbortController();
    const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          messages: [
            {
              role: 'system',
              content: this.buildSystemPrompt(scope, role, intent, context),
            },
            ...history.slice(-6).map((item) => ({
              role: item.role,
              content: item.content,
            })),
            { role: 'user', content: message },
          ],
        }),
      });
    } catch (error) {
      const details = this.formatFetchError(error);
      this.logger.error(
        `Ollama request failed for user ${userId}. url=${requestUrl} model=${model} details=${details}`,
      );
      throw new Error(`Ollama ulanish xatosi: ${details}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama HTTP ${response.status}: ${text}`);
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
        if (!trimmed) continue;
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string };
        };
        const chunk = parsed.message?.content ?? '';
        if (chunk) onChunk(chunk);
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer.trim()) as {
        message?: { content?: string };
      };
      const chunk = parsed.message?.content ?? '';
      if (chunk) onChunk(chunk);
    }
  }

  private async buildContext(args: {
    userId: string;
    role: Role;
    organizationIds: string[];
    scope: AiChatScope;
    intent: QueryIntent;
  }) {
    if (args.role === Role.USER) {
      return this.buildUserContext(args.userId, args.intent);
    }
    return this.buildAdminContext(
      args.userId,
      args.role,
      args.organizationIds,
      args.intent,
    );
  }

  private async buildUserContext(userId: string, intent: QueryIntent) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const orgId = user.organizations?.[0]?.organization?.id ?? null;
    const context: Record<string, unknown> = {
      actor: 'user',
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        organizations: (user.organizations ?? []).map((item) => ({
          id: item.organization?.id ?? '',
          name: item.organization?.name ?? '',
        })),
      },
    };

    if (intent === 'mistakes' || intent === 'general') {
      const heartLossByQuestion = await this.getSelfHeartLossQuestions(userId);
      const recentMistakes = await this.getRecentMistakes(userId, 4);
      context.heartLossQuestions = heartLossByQuestion.slice(0, 5);
      context.recentMistakes = recentMistakes;
    }

    if (intent === 'progress' || intent === 'general') {
      context.progress = await this.getCompactProgress(userId);
    }

    if (intent === 'leaderboard' || intent === 'general') {
      context.leaderboard = orgId
        ? await this.getOrganizationLeaderboardPosition(orgId, userId)
        : null;
    }

    if (intent === 'exam' || intent === 'general') {
      const nextExam = await this.assignmentRepo.findOne({
        where: {
          userId,
          status: In(['PENDING', 'SCHEDULED']),
        },
        relations: ['exam'],
        order: { suggestedAt: 'ASC' },
      });
      context.nextExam = nextExam
        ? {
            examTitle: nextExam.exam?.title ?? null,
            suggestedAt: nextExam.suggestedAt?.toISOString() ?? null,
            scheduledAt: nextExam.scheduledAt?.toISOString() ?? null,
            status: nextExam.status,
          }
        : null;
    }

    if (intent === 'employee' || intent === 'general') {
      const certificate = await this.employeeCertificateRepo.findOne({
        where: { userId },
        relations: ['organization'],
      });
      const checks = await this.employeeCheckRepo.find({
        where: { userId },
        order: { checkDate: 'DESC', createdAt: 'DESC' },
        take: 3,
      });
      context.employee = {
        certificate: certificate
          ? {
              positionTitle: certificate.positionTitle,
              organizationName: certificate.organization?.name ?? null,
            }
          : null,
        recentChecks: checks.map((check) => ({
          type: check.type,
          checkDate: check.checkDate ?? null,
          nextCheckDate: check.nextCheckDate ?? null,
          grade: check.grade,
        })),
      };
    }

    return context;
  }

  private async buildAdminContext(
    userId: string,
    role: Role,
    organizationIds: string[],
    intent: QueryIntent,
  ) {
    if (role === Role.USER) throw new ForbiddenException();

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Admin topilmadi');

    const scopedOrgIds =
      role === Role.MODERATOR
        ? await this.organizationsService.resolveModeratorScope(organizationIds)
        : undefined;

    const context: Record<string, unknown> = {
      actor: 'admin',
      admin: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizations: (user.organizations ?? []).map((item) => ({
          id: item.organization?.id ?? '',
          name: item.organization?.name ?? '',
        })),
      },
      scope: scopedOrgIds === undefined ? 'all' : scopedOrgIds,
    };

    if (intent === 'admin_analytics' || intent === 'general') {
      const totalOrganizations =
        scopedOrgIds && scopedOrgIds.length >= 0
          ? scopedOrgIds.length
          : await this.organizationRepo.count();

      const totalStudents =
        scopedOrgIds === undefined
          ? await this.userOrgRepo.count({
              where: { user: { role: Role.USER } },
            })
          : scopedOrgIds.length === 0
            ? 0
            : await this.userOrgRepo.count({
                where: {
                  user: { role: Role.USER },
                  organization: { id: In(scopedOrgIds) },
                },
              });

      context.summary = {
        totalOrganizations,
        totalStudents,
        activeUsers7d: await this.getActiveUsers7d(scopedOrgIds),
        upcomingExamCount: await this.getUpcomingExamCount(scopedOrgIds),
      };
      context.topQuestionErrors = await this.getScopedQuestionErrors(
        scopedOrgIds,
        5,
      );
      context.topHeartLossQuestions = await this.getScopedHeartsLost(
        scopedOrgIds,
        5,
      );
      context.topUsersByHeartLoss = await this.getScopedUsersByHeartLoss(
        scopedOrgIds,
        5,
      );
    }

    return context;
  }

  private async getCompactProgress(userId: string) {
    const levels = await this.levelRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC' },
      take: 6,
    });
    const completions = await this.completionRepo.find({ where: { userId } });
    const attempts = await this.attemptRepo.find({
      where: { userId },
      order: { answeredAt: 'DESC' },
      take: 80,
    });

    const correctCount = attempts.filter((item) => item.isCorrect).length;
    const completedLevels = completions.filter(
      (item) => item.completionPercent >= 100,
    ).length;
    const currentLevel =
      levels.find((level) => {
        const completion = completions.find((item) => item.levelId === level.id);
        return !completion || completion.completionPercent < 100;
      }) ?? levels.at(-1) ?? null;

    return {
      totalXp: correctCount * 10,
      totalAnswers: attempts.length,
      correctAnswers: correctCount,
      wrongAnswers: Math.max(0, attempts.length - correctCount),
      completedLevels,
      currentLevel: currentLevel
        ? {
            title: currentLevel.title,
            orderIndex: currentLevel.orderIndex,
          }
        : null,
      levels: levels.map((level) => {
        const completion = completions.find((item) => item.levelId === level.id);
        return {
          title: level.title,
          completionPercent: completion?.completionPercent ?? 0,
        };
      }),
    };
  }

  private async getRecentMistakes(userId: string, limit: number) {
    const attempts = await this.attemptRepo.find({
      where: { userId, isCorrect: false },
      order: { answeredAt: 'DESC' },
      take: limit,
    });
    const questionIds = Array.from(new Set(attempts.map((item) => item.questionId)));
    const questions = questionIds.length
      ? await this.questionRepo.find({
          where: { id: In(questionIds) },
          relations: ['level', 'theory'],
        })
      : [];
    const questionMap = new Map(questions.map((item) => [item.id, item]));

    return attempts.map((attempt) => {
      const question = questionMap.get(attempt.questionId);
      return {
        prompt: question?.prompt ?? 'Savol topilmadi',
        levelTitle: question?.level?.title ?? 'Noma`lum level',
        theoryTitle: question?.theory?.title ?? 'Noma`lum mavzu',
        answeredAt: attempt.answeredAt?.toISOString() ?? null,
      };
    });
  }

  private async getSelfHeartLossQuestions(userId: string) {
    const rows = await this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.question', 'q')
      .innerJoin('q.level', 'l')
      .innerJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)::int', 'lostHearts')
      .addSelect('MAX(a.answered_at)', 'lastAnsweredAt')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.is_correct = false')
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .orderBy('"lostHearts"', 'DESC')
      .limit(8)
      .getRawMany<{
        questionId: string;
        prompt: string;
        levelTitle: string;
        theoryTitle: string;
        lostHearts: number;
        lastAnsweredAt: string | null;
      }>();

    return rows.map((row) => ({
      questionId: row.questionId,
      prompt: row.prompt,
      levelTitle: row.levelTitle,
      theoryTitle: row.theoryTitle,
      lostHearts: Number(row.lostHearts) || 0,
      lastAnsweredAt: row.lastAnsweredAt,
    }));
  }

  private async getOrganizationLeaderboardPosition(orgId: string, userId: string) {
    const leaderboardRows = await this.attemptRepo
      .createQueryBuilder('attempt')
      .select('attempt.userId', 'userId')
      .addSelect(
        'COUNT(*) FILTER (WHERE attempt.is_correct = true) * 10',
        'xp',
      )
      .where('attempt.organization_id = :orgId', { orgId })
      .groupBy('attempt.userId')
      .orderBy('"xp"', 'DESC')
      .addOrderBy('attempt.userId', 'ASC')
      .getRawMany<{ userId: string; xp: string }>();

    let previousXp: number | null = null;
    let rank = 0;

    for (let index = 0; index < leaderboardRows.length; index += 1) {
      const row = leaderboardRows[index];
      const xp = Number(row.xp) || 0;
      if (previousXp === null || xp < previousXp) {
        rank += 1;
        previousXp = xp;
      }
      if (row.userId === userId) {
        return { organizationRank: rank, xp };
      }
    }

    return null;
  }

  private async getActiveUsers7d(scopedOrgIds?: string[]) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const qb = this.refreshTokenRepo
      .createQueryBuilder('rt')
      .leftJoin('rt.user', 'u')
      .leftJoin('u.organizations', 'uo')
      .where('rt.created_at >= :since', { since })
      .select('u.id', 'userId')
      .distinct(true);

    if (scopedOrgIds !== undefined) {
      if (scopedOrgIds.length === 0) return 0;
      qb.andWhere('uo.organization_id IN (:...orgIds)', { orgIds: scopedOrgIds });
    }

    const rows = await qb.getRawMany();
    return rows.length;
  }

  private async getScopedQuestionErrors(scopedOrgIds: string[] | undefined, limit: number) {
    const qb = this.attemptRepo
      .createQueryBuilder('uqa')
      .leftJoin('uqa.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)::int', 'totalAttempts')
      .addSelect('COUNT(*) FILTER (WHERE uqa.is_correct = false)::int', 'wrongAttempts')
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .orderBy('"wrongAttempts"', 'DESC')
      .limit(limit);

    if (scopedOrgIds !== undefined) {
      if (scopedOrgIds.length === 0) return [];
      qb.andWhere('uqa.organization_id IN (:...orgIds)', { orgIds: scopedOrgIds });
    }

    const rows = await qb.getRawMany<{
      questionId: string;
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
      totalAttempts: number;
      wrongAttempts: number;
    }>();

    return rows.map((row) => ({
      questionId: row.questionId,
      prompt: row.prompt,
      levelTitle: row.levelTitle,
      theoryTitle: row.theoryTitle,
      totalAttempts: Number(row.totalAttempts) || 0,
      wrongAttempts: Number(row.wrongAttempts) || 0,
      errorRate:
        Number(row.totalAttempts) > 0
          ? Math.round((Number(row.wrongAttempts) / Number(row.totalAttempts)) * 100)
          : 0,
    }));
  }

  private async getScopedHeartsLost(scopedOrgIds: string[] | undefined, limit: number) {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);

    const qb = this.attemptRepo
      .createQueryBuilder('uqa')
      .leftJoin('uqa.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)::int', 'lostHearts')
      .where('uqa.answered_at >= :from', { from })
      .andWhere('uqa.is_correct = false')
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .orderBy('"lostHearts"', 'DESC')
      .limit(limit);

    if (scopedOrgIds !== undefined) {
      if (scopedOrgIds.length === 0) return [];
      qb.andWhere('uqa.organization_id IN (:...orgIds)', { orgIds: scopedOrgIds });
    }

    const rows = await qb.getRawMany<{
      questionId: string;
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
      lostHearts: number;
    }>();

    return rows.map((row) => ({
      questionId: row.questionId,
      prompt: row.prompt,
      levelTitle: row.levelTitle,
      theoryTitle: row.theoryTitle,
      lostHearts: Number(row.lostHearts) || 0,
    }));
  }

  private async getScopedUsersByHeartLoss(scopedOrgIds: string[] | undefined, limit: number) {
    const from = new Date();
    from.setMonth(from.getMonth() - 1);

    const qb = this.attemptRepo
      .createQueryBuilder('uqa')
      .leftJoin('uqa.user', 'u')
      .select('u.id', 'userId')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.email', 'email')
      .addSelect('COUNT(*)::int', 'lostHearts')
      .where('uqa.answered_at >= :from', { from })
      .andWhere('uqa.is_correct = false')
      .groupBy('u.id')
      .addGroupBy('u.first_name')
      .addGroupBy('u.last_name')
      .addGroupBy('u.email')
      .orderBy('"lostHearts"', 'DESC')
      .limit(limit);

    if (scopedOrgIds !== undefined) {
      if (scopedOrgIds.length === 0) return [];
      qb.andWhere('uqa.organization_id IN (:...orgIds)', { orgIds: scopedOrgIds });
    }

    const rows = await qb.getRawMany<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      lostHearts: number;
    }>();

    return rows.map((row) => ({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      lostHearts: Number(row.lostHearts) || 0,
    }));
  }

  private async getUpcomingExamCount(scopedOrgIds: string[] | undefined) {
    const whereBase = { status: In(['PENDING', 'SCHEDULED']) };
    if (scopedOrgIds === undefined) {
      return this.assignmentRepo.count({ where: whereBase });
    }
    if (scopedOrgIds.length === 0) return 0;
    return this.assignmentRepo.count({
      where: {
        ...whereBase,
        organizationId: In(scopedOrgIds),
      },
    });
  }

  private buildSystemPrompt(
    scope: AiChatScope,
    role: Role,
    intent: QueryIntent,
    context: unknown,
  ) {
    const base = [
      'Sen ElektroLearn ichidagi AI yordamchisan.',
      'Faqat USER_CONTEXT ichidagi ma`lumotlarga tayan.',
      'Mavjud bo`lmagan yoki ruxsat berilmagan ma`lumotni uydirma.',
      'Kerak bo`lsa ochiq ayt: "Menda hozir bu ma`lumot yo`q".',
      'Javoblar aniq, ixcham va amaliy bo`lsin.',
      `Current intent: ${intent}`,
    ];

    if (scope === 'mobile' || role === Role.USER) {
      base.push(
        'Bu foydalanuvchi mobil ilovadagi xodim/o`quvchi.',
        'Heart loss savollarini asosiy manba deb ol: qaysi savollarda jon yo`qotgan bo`lsa, shularni ustuvor tahlil qil.',
        'Agar foydalanuvchi qaysi savollarda xato qilganini so`rasa, heartLossQuestions ichidan misollar ber.',
      );
    } else {
      base.push(
        'Bu foydalanuvchi admin paneldagi moderator yoki superadmin.',
        'Javoblarda tashkilot kesimidagi tahlil, eng muammoli savollar va eng ko`p jon yo`qotayotgan foydalanuvchilarni asosiy signal sifatida ishlat.',
      );
    }

    base.push(`USER_CONTEXT:\n${JSON.stringify(context)}`);
    return base.join('\n');
  }

  private detectIntent(
    message: string,
    scope: AiChatScope,
    role: Role,
  ): QueryIntent {
    const text = message.toLowerCase();

    if (
      /xato|savol|adash|heart|jon|yo['`’]qot|yoqot|mistake|wrong/.test(text)
    ) {
      return 'mistakes';
    }
    if (/daraja|level|progress|xp|mavzu|ustida ishlash/.test(text)) {
      return 'progress';
    }
    if (/reyting|rank|leaderboard|o['`’]rin|nechanchi/.test(text)) {
      return 'leaderboard';
    }
    if (/imtihon|exam|sana|scheduled|qachon/.test(text)) {
      return 'exam';
    }
    if (/guvohnoma|certificate|check|tekshiruv|medical|permit/.test(text)) {
      return 'employee';
    }
    if (
      scope === 'admin' ||
      role !== Role.USER ||
      /foydalanuvchi|analytics|analitika|moderator|tashkilot/.test(text)
    ) {
      return 'admin_analytics';
    }
    return 'general';
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
    return String(error);
  }
}
