import { Injectable, Logger } from '@nestjs/common';
import {
  AI_PROVIDER,
  hasOllamaConfig,
  hasOpenRouterConfig,
  OLLAMA_BASE_URL,
  OLLAMA_MODEL,
  OLLAMA_TIMEOUT_MS,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
} from './ai-chat.config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { Exam } from '../database/entities/exam.entity';
import { Level } from '../database/entities/level.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';

export type AiChatScope = 'mobile' | 'admin';

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
  ) {}

  normalizeScope(role: Role | undefined, requestedScope?: string): AiChatScope {
    if (role === Role.USER) return 'mobile';
    if (role === Role.MODERATOR || role === Role.SUPERADMIN) {
      return requestedScope === 'mobile' ? 'mobile' : 'admin';
    }
    return requestedScope === 'admin' ? 'admin' : 'mobile';
  }

  getProviderStatus() {
    return {
      provider: AI_PROVIDER,
      openRouterConfigured: hasOpenRouterConfig(),
      ollamaConfigured: hasOllamaConfig(),
      openRouterModel: OPENROUTER_MODEL,
      ollamaModel: OLLAMA_MODEL,
      ollamaBaseUrl: OLLAMA_BASE_URL,
      ready: true,
    };
  }

  /**
   * Simple messenger mode:
   * - no DB context
   * - no chat history sent to model
   * - only user's message is forwarded to Ollama
   */
  async streamReply(args: {
    userId: string;
    scope: AiChatScope;
    message: string;
    onChunk: (chunk: string) => void;
  }) {
    const ctx =
      args.scope === 'admin'
        ? await this.getAdminContextLine(args.userId)
        : await this.getMobileContextLine(args.userId);
    const systemPrompt =
      args.scope === 'admin'
        ? "Sen ElektroLearn admin panelidagi o'zbekcha AI yordamchisan. Moderator/superadmin filial statistikasi, xodimlar aktivligi, kunlik plan natijasi va xato savollar bo'yicha qisqa, aniq javob ber. Hech qachon UUID/token ko'rsatma. Kontekst yetmasa 1 ta aniqlashtiruvchi savol ber."
        : "Sen o'zbekcha gapiradigan o'quv yordamchisan. Foydalanuvchi progressi, xatolar, daraja va imtihon holati bo'yicha yordam ber. Hech qachon ID/UUID ko'rsatma. Kontekst yetmasa 1 ta aniqlashtiruvchi savol ber.";
    const userPrompt = `${ctx}\nSAVOL: ${args.message}`;

    await this.streamWithFallback({
      system: systemPrompt,
      user: userPrompt,
      onChunk: args.onChunk,
    });
  }

  private async streamWithFallback(args: {
    system: string;
    user: string;
    onChunk: (chunk: string) => void;
  }) {
    const errors: string[] = [];

    if (AI_PROVIDER === 'ollama') {
      await this.streamFromOllama(args);
      return;
    }

    if (AI_PROVIDER === 'openrouter' || AI_PROVIDER === 'auto') {
      try {
        await this.streamFromOpenRouter(args);
        return;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`OpenRouter: ${msg}`);
        if (AI_PROVIDER === 'openrouter') throw error;
      }
    }

    try {
      await this.streamFromOllama(args);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Ollama: ${msg}`);
      throw new Error(errors.join(' | '));
    }
  }

  private async streamFromOllama(args: {
    system: string;
    user: string;
    onChunk: (chunk: string) => void;
  }) {
    const model = OLLAMA_MODEL;
    const baseUrl = OLLAMA_BASE_URL;
    const requestUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;

    const controller = new AbortController();
    const timeoutMs = OLLAMA_TIMEOUT_MS;
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
              content: args.system,
            },
            { role: 'user', content: args.user },
          ],
        }),
      });
    } catch (error) {
      const details = this.formatFetchError(error);
      this.logger.error(
        `Ollama request failed. url=${requestUrl} model=${model} details=${details}`,
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
        if (chunk) args.onChunk(chunk);
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer.trim()) as {
        message?: { content?: string };
      };
      const chunk = parsed.message?.content ?? '';
      if (chunk) args.onChunk(chunk);
    }
  }

  private async streamFromOpenRouter(args: {
    system: string;
    user: string;
    onChunk: (chunk: string) => void;
  }) {
    const baseUrl = 'https://openrouter.ai/api';
    const apiKey = OPENROUTER_API_KEY;
    const model = OPENROUTER_MODEL;
    const timeoutMs = 120000;
    const maxTokens = 512;
    const requestUrl = `${baseUrl}/v1/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://elektrolearn.uzbekistonmet.uz',
          'X-Title': 'ElektroLearn',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          temperature: 0.2,
          max_tokens: Number.isFinite(maxTokens) ? maxTokens : 256,
          messages: [
            { role: 'system', content: args.system },
            { role: 'user', content: args.user },
          ],
        }),
      });
    } catch (error) {
      const details = this.formatFetchError(error);
      this.logger.error(
        `OpenRouter request failed. url=${requestUrl} model=${model} details=${details}`,
      );
      throw new Error(`OpenRouter ulanish xatosi: ${details}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      throw new Error(`OpenRouter HTTP ${response.status}: ${text}`);
    }

    // OpenAI-style SSE stream: lines start with `data: {json}` and end with `data: [DONE]`.
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
          // ignore parse errors on partial lines
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

  private async getAdminContextLine(userId: string) {
    const key = `admin:${userId}`;
    const now = Date.now();
    const cached = this.ctxCache.get(key);
    if (cached && now - cached.at < this.ctxTtlMs) return cached.ctx;

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    const org = user?.organizations?.[0]?.organization ?? null;
    const orgId = org?.id;

    if (!orgId) {
      const ctx = 'CTX: scope=admin org=- role=moderator ma_lumot_yoq';
      this.ctxCache.set(key, { at: now, ctx });
      return ctx;
    }

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const totalEmployeesRow = await this.userOrgRepo
      .createQueryBuilder('uo')
      .innerJoin('uo.user', 'u')
      .innerJoin('uo.organization', 'org')
      .where('org.id = :orgId', { orgId })
      .andWhere('u.role = :role', { role: Role.USER })
      .select('COUNT(*)::int', 'count')
      .getRawOne<{ count: number }>();
    const totalEmployees = totalEmployeesRow?.count ?? 0;

    const quizTakers = await this.attemptRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.user_id)::int', 'count')
      .where('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :since', { since })
      .getRawOne<{ count: number }>();

    const wrongRows: Array<{ prompt: string; wrong: number }> =
      await this.attemptRepo.query(
        `
        SELECT q.prompt AS prompt, COUNT(*)::int AS wrong
        FROM user_question_attempts a
        JOIN questions q ON q.id = a.question_id
        WHERE a.organization_id = $1
          AND a.is_correct = false
          AND a.answered_at >= $2
        GROUP BY q.id, q.prompt
        ORDER BY wrong DESC
        LIMIT 5
        `,
        [orgId, since],
      );

    const wrongPart = wrongRows.length
      ? ` top_wrong=[${wrongRows
          .map((r) => {
            const p = (r.prompt ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
            return `"${p} (${r.wrong}x)"`;
          })
          .join(', ')}]`
      : '';

    const ctx = `CTX: scope=admin org="${org?.name ?? '-'}" employees=${totalEmployees} quiz_takers_7d=${quizTakers?.count ?? 0}${wrongPart}`;
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
