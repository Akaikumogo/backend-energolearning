import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { Level } from '../database/entities/level.entity';
import { Question } from '../database/entities/question.entity';
import { Theory } from '../database/entities/theory.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';

export type AiChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

type StreamReplyArgs = {
  userId: string;
  message: string;
  history: AiChatTurn[];
  onChunk: (chunk: string) => void;
};

type MistakeSummary = {
  questionId: string;
  prompt: string;
  levelTitle: string;
  theoryTitle: string;
  wrongCount: number;
  lastAnsweredAt: string | null;
};

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
  ) {}

  async streamReply({ userId, message, history, onChunk }: StreamReplyArgs) {
    const context = await this.buildUserContext(userId);
    const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b';
    const baseUrl =
      process.env.OLLAMA_BASE_URL?.trim() || 'http://192.0.6.84:11434';
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
              content: this.buildSystemPrompt(context),
            },
            ...history.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            {
              role: 'user',
              content: message,
            },
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
          done?: boolean;
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

  private async buildUserContext(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const levels = await this.levelRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC' },
    });
    const completions = await this.completionRepo.find({ where: { userId } });
    const attempts = await this.attemptRepo.find({
      where: { userId },
      order: { answeredAt: 'DESC' },
      take: 200,
    });

    const questionIds = Array.from(
      new Set(attempts.map((attempt) => attempt.questionId)),
    );
    const questions = questionIds.length
      ? await this.questionRepo.find({
          where: { id: In(questionIds) },
          relations: ['level', 'theory'],
        })
      : [];

    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const correctCount = attempts.filter((attempt) => attempt.isCorrect).length;
    const wrongAttempts = attempts.filter((attempt) => !attempt.isCorrect);
    const wrongByQuestion = new Map<string, MistakeSummary>();

    for (const attempt of wrongAttempts) {
      const question = questionMap.get(attempt.questionId);
      if (!question) continue;
      const existing = wrongByQuestion.get(attempt.questionId);
      if (existing) {
        existing.wrongCount += 1;
        if (!existing.lastAnsweredAt) {
          existing.lastAnsweredAt = attempt.answeredAt.toISOString();
        }
        continue;
      }
      wrongByQuestion.set(attempt.questionId, {
        questionId: question.id,
        prompt: question.prompt,
        levelTitle: question.level?.title ?? 'Noma`lum level',
        theoryTitle: question.theory?.title ?? 'Noma`lum mavzu',
        wrongCount: 1,
        lastAnsweredAt: attempt.answeredAt?.toISOString() ?? null,
      });
    }

    const completedLevels = completions.filter(
      (completion) => completion.completionPercent >= 100,
    ).length;
    const currentLevel =
      levels.find((level) => {
        const completion = completions.find((item) => item.levelId === level.id);
        return !completion || completion.completionPercent < 100;
      }) ?? levels.at(-1) ?? null;

    const orgId = user.organizations?.[0]?.organization?.id ?? null;
    const nextExam = await this.assignmentRepo.findOne({
      where: {
        userId,
        status: In(['PENDING', 'SCHEDULED']),
      },
      relations: ['exam'],
      order: { suggestedAt: 'ASC' },
    });

    const certificate = await this.employeeCertificateRepo.findOne({
      where: { userId },
      relations: ['organization'],
    });
    const checks = await this.employeeCheckRepo.find({
      where: { userId },
      order: { checkDate: 'DESC', createdAt: 'DESC' },
      take: 5,
    });

    const leaderboardRows = orgId
      ? await this.attemptRepo
          .createQueryBuilder('attempt')
          .select('attempt.userId', 'userId')
          .addSelect(
            'COUNT(*) FILTER (WHERE attempt.isCorrect = true) * 10',
            'xp',
          )
          .where('attempt.organizationId = :orgId', { orgId })
          .groupBy('attempt.userId')
          .orderBy('"xp"', 'DESC')
          .addOrderBy('attempt.userId', 'ASC')
          .getRawMany<{ userId: string; xp: string }>()
      : [];

    const leaderboardRow = (() => {
      if (!leaderboardRows.length) return null;
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
          return { rank, xp };
        }
      }
      return null;
    })();

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        organizations: (user.organizations ?? []).map((item) => ({
          id: item.organization?.id,
          name: item.organization?.name,
        })),
      },
      progress: {
        totalXp: correctCount * 10,
        totalAnswers: attempts.length,
        correctAnswers: correctCount,
        wrongAnswers: wrongAttempts.length,
        completedLevels,
        currentLevel: currentLevel
          ? {
              id: currentLevel.id,
              title: currentLevel.title,
              orderIndex: currentLevel.orderIndex,
            }
          : null,
        levels: levels.map((level) => {
          const completion = completions.find((item) => item.levelId === level.id);
          return {
            id: level.id,
            title: level.title,
            completionPercent: completion?.completionPercent ?? 0,
            completedAt: completion?.completedAt?.toISOString() ?? null,
          };
        }),
      },
      weakTopics: Array.from(wrongByQuestion.values())
        .sort((a, b) => b.wrongCount - a.wrongCount)
        .slice(0, 8),
      recentMistakes: wrongAttempts.slice(0, 5).map((attempt) => {
        const question = questionMap.get(attempt.questionId);
        return {
          questionId: attempt.questionId,
          answeredAt: attempt.answeredAt?.toISOString() ?? null,
          prompt: question?.prompt ?? 'Savol topilmadi',
          levelTitle: question?.level?.title ?? 'Noma`lum level',
          theoryTitle: question?.theory?.title ?? 'Noma`lum mavzu',
        };
      }),
      leaderboard: orgId
        ? {
            organizationRank: leaderboardRow?.rank ?? null,
            xp: leaderboardRow?.xp ?? correctCount * 10,
          }
        : null,
      nextExam: nextExam
        ? {
            assignmentId: nextExam.id,
            examTitle: nextExam.exam?.title ?? null,
            suggestedAt: nextExam.suggestedAt?.toISOString() ?? null,
            scheduledAt: nextExam.scheduledAt?.toISOString() ?? null,
            status: nextExam.status,
          }
        : null,
      employee: {
        certificate: certificate
          ? {
              positionTitle: certificate.positionTitle,
              certificateNumber: certificate.certificateNumber,
              organizationName: certificate.organization?.name ?? null,
            }
          : null,
        recentChecks: checks.map((check) => ({
          type: check.type,
          checkDate: check.checkDate ?? null,
          nextCheckDate: check.nextCheckDate ?? null,
          grade: check.grade,
          conclusion: check.conclusion,
        })),
      },
    };
  }

  private buildSystemPrompt(context: Awaited<ReturnType<AiChatService['buildUserContext']>>) {
    return [
      'Sen ElektroLearn ichidagi foydalanuvchi uchun AI mentor-san.',
      'Faqat quyidagi USER_CONTEXT ichidagi ma`lumotlarga tayangan holda javob ber.',
      'Hech qachon boshqa foydalanuvchi, boshqa tashkilot yoki butun baza haqida ma`lumot uydirma yoki oshkor qilma.',
      'Agar savol contextda bo`lmasa, ochiq ayt: "Menda hozir bu ma`lumot yo`q".',
      'Javoblar qisqa, amaliy va o`zbek tilida bo`lsin.',
      'Agar foydalanuvchi xatolari haqida so`rasa, kuchsiz mavzularni sanab ber va keyingi mashq yo`nalishini tavsiya qil.',
      'Agar reyting, daraja, imtihon sanasi, certificate yoki check haqida so`rasa, faqat shu contextdan foydalan.',
      `USER_CONTEXT:\n${JSON.stringify(context)}`,
    ].join('\n');
  }

  private formatFetchError(error: unknown) {
    if (!error) return 'unknown';
    if (error instanceof Error) {
      const cause = error.cause as
        | { code?: string; errno?: number | string; syscall?: string; address?: string; port?: number }
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
