import { Injectable, Logger } from '@nestjs/common';
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

export type AiChatScope = 'mobile' | 'admin';

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  private readonly ctxCache = new Map<string, { at: number; ctx: string }>();
  private readonly ctxTtlMs = 30_000;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
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
    return requestedScope === 'admin' ? 'admin' : 'mobile';
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
    const ctx = await this.getContextLine(args.userId, args.scope);
    const systemPrompt =
      "Sen o'zbekcha gapiradigan yordamchisan. Faqat kerakli savol-javob. Hech qachon ID/UUID/token yoki ichki kodlarni foydalanuvchiga ko'rsatma id bilan topilgan ma'lumotlarni esa asosan string bo'lgan NAME larni tilte larni olib kel misol uchun question ning matni va bo'limning matni . Kontekst yetmasa 1 ta aniqlashtiruvchi savol ber.";
    const userPrompt = `${ctx}\nSAVOL: ${args.message}`;

    // Provider selection:
    // 1) Explicit AI_PROVIDER=openrouter
    // 2) If OpenRouter key exists, prefer it (useful in prod where Ollama is not available)
    // 3) Fallback to Ollama
    const provider =
      process.env.AI_PROVIDER?.trim().toLowerCase() ||
      (process.env.ANTHROPIC_AUTH_TOKEN?.trim() ? 'openrouter' : 'ollama');

    if (provider === 'openrouter') {
      await this.streamFromOpenRouter({
        system: systemPrompt,
        user: userPrompt,
        onChunk: args.onChunk,
      });
      return;
    }

    await this.streamFromOllama({
      system: systemPrompt,
      user: userPrompt,
      onChunk: args.onChunk,
    });
  }

  private async streamFromOllama(args: {
    system: string;
    user: string;
    onChunk: (chunk: string) => void;
  }) {
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
    const baseUrl = (process.env.ANTHROPIC_BASE_URL?.trim() || 'https://openrouter.ai/api').replace(
      /\/$/,
      '',
    );
    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN?.trim() || '';
    if (!apiKey) throw new Error('OpenRouter key yo`q (ANTHROPIC_AUTH_TOKEN)');

    const model =
      process.env.ANTHROPIC_DEFAULT_SONNET_MODEL?.trim() ||
      process.env.ANTHROPIC_DEFAULT_OPUS_MODEL?.trim() ||
      process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL?.trim() ||
      'openai/gpt-4o-mini';

    const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? process.env.OLLAMA_TIMEOUT_MS ?? 120000);
    const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 256);
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
          // Optional but recommended by OpenRouter. Keep safe defaults.
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER?.trim() || 'http://localhost',
          'X-Title': process.env.OPENROUTER_APP_TITLE?.trim() || 'ElectroLearn',
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

  private async getContextLine(userId: string, scope: AiChatScope) {
    const key = `${userId}:${scope}`;
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
    const ctx = `CTX: scope=${scope} org=${org?.name ?? '-'} xp=${totalXp} stage=${stage} exam=${examFlag} exam_title=${examTitle} exam_status=${examStatus} exam_at=${examAt}${wrongPart}`;
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
