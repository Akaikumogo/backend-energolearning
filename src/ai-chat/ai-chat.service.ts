import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
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
    const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5-coder:7b';
    const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://127.0.0.1:11434';
    const requestUrl = `${baseUrl.replace(/\/$/, '')}/api/chat`;

    const ctx = await this.getContextLine(args.userId, args.scope);

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
              content:
                "Sen o'zbekcha gapiradigan yordamchisan. Faqat kerakli savol-javob. Kontekst yetmasa 1 ta aniqlashtiruvchi savol ber.",
            },
            { role: 'user', content: `${ctx}\nSAVOL: ${args.message}` },
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
        const parsed = JSON.parse(trimmed) as { message?: { content?: string } };
        const chunk = parsed.message?.content ?? '';
        if (chunk) args.onChunk(chunk);
      }
    }

    if (buffer.trim()) {
      const parsed = JSON.parse(buffer.trim()) as { message?: { content?: string } };
      const chunk = parsed.message?.content ?? '';
      if (chunk) args.onChunk(chunk);
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

    const wrongRows = (await this.attemptRepo.query(
      `
      SELECT a.question_id AS "questionId"
      FROM user_question_attempts a
      WHERE a.user_id = $1
        AND a.is_correct = false
      ORDER BY a.answered_at DESC
      LIMIT 30;
      `,
      [userId],
    )) as Array<{ questionId: string }>;
    const wrongDistinct: string[] = [];
    for (const r of wrongRows) {
      const qid = r.questionId;
      if (!qid) continue;
      if (wrongDistinct.includes(qid)) continue;
      wrongDistinct.push(qid);
      if (wrongDistinct.length >= 10) break;
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

    const ctx = `CTX: uid=${userId} scope=${scope} org=${org?.name ?? '-'} xp=${totalXp} stage=${stage} exam=${examFlag} exam_status=${examStatus} exam_at=${examAt} wrong_q=[${wrongDistinct.join(',')}]`;
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
    return String(error);
  }
}
