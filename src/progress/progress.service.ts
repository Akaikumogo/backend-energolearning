import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, QueryFailedError, Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { SubmitAnswerDto, AttemptSource } from './dto/submit-answer.dto';
import { SubmitMatchingDto } from './dto/submit-matching.dto';
import { HeartsService } from '../hearts/hearts.service';
import { TheoryRole } from '../common/enums/theory-role.enum';
import { QuestionType } from '../common/enums/question-type.enum';
import { DAILY_GOAL_CORRECT } from '../branch-analytics/daily-plan.service';
import {
  tashkentDayBounds,
  tashkentToday,
} from '../common/utils/tashkent-time.util';

const BADGES = [
  { label: 'Yangi ishchi', bolts: 1 },
  { label: 'Elektrik yordamchi', bolts: 2 },
  { label: 'Elektrik mutaxassis', bolts: 3 },
  { label: 'Senior elektrik', bolts: 4 },
  { label: 'Magistral ekspert', bolts: 5 },
];

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(Level) private readonly levelRepo: Repository<Level>,
    @InjectRepository(Theory) private readonly theoryRepo: Repository<Theory>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepo: Repository<QuestionOption>,
    @InjectRepository(UserLevelCompletion)
    private readonly completionRepo: Repository<UserLevelCompletion>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly heartsService: HeartsService,
  ) {}

  private async getPositionAvailableLevels(userId: string): Promise<Level[]> {
    let rows: Array<{ id: string }>;

    try {
      rows = (await this.levelRepo.query(
        `
        SELECT l.id
        FROM "levels" l
        WHERE l.is_active = true
          AND (
            NOT EXISTS (
              SELECT 1 FROM "level_positions" lp
              WHERE lp.level_id = l.id
            )
            OR EXISTS (
              SELECT 1
              FROM "level_positions" lp
              INNER JOIN "user_positions" up
                ON up.position_id = lp.position_id AND up.user_id = $1
              WHERE lp.level_id = l.id
            )
          )
        ORDER BY l.order_index ASC, l.created_at ASC
        `,
        [userId],
      )) as Array<{ id: string }>;
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      rows = (await this.levelRepo.query(
        `
        SELECT l.id
        FROM "levels" l
        WHERE l.is_active = true
        ORDER BY l.order_index ASC, l.created_at ASC
        `,
      )) as Array<{ id: string }>;
    }

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return [];

    const levels = await this.levelRepo.find({ where: { id: In(ids) } });
    const byId = new Map(levels.map((level) => [level.id, level]));
    return ids.map((id) => byId.get(id)).filter((level): level is Level => !!level);
  }

  async getMyProgress(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    const orgId = user.organizations?.[0]?.organization?.id ?? null;

    const levels = await this.getPositionAvailableLevels(userId);

    const completions = await this.completionRepo.find({
      where: { userId },
    });
    const completionMap = new Map(completions.map((c) => [c.levelId, c]));

    const levelIds = levels.map((level) => level.id);
    const levelAttemptRows = levelIds.length
      ? await this.attemptRepo
          .createQueryBuilder('a')
          .innerJoin('a.question', 'q')
          .select('q.level_id', 'levelId')
          .addSelect('COUNT(*)::int', 'attemptsCount')
          .addSelect(
            'COUNT(*) FILTER (WHERE a.is_correct = true)::int',
            'correctAnswersCount',
          )
          .where('a.user_id = :userId', { userId })
          .andWhere('q.level_id IN (:...levelIds)', { levelIds })
          .groupBy('q.level_id')
          .getRawMany<{
            levelId: string;
            attemptsCount: number;
            correctAnswersCount: number;
          }>()
      : [];
    const levelAttemptsMap = new Map(
      levelAttemptRows.map((row) => [
        row.levelId,
        {
          attemptsCount: Number(row.attemptsCount) || 0,
          correctAnswersCount: Number(row.correctAnswersCount) || 0,
        },
      ]),
    );

    const correctCount = await this.attemptRepo.count({
      where: { userId, isCorrect: true, countsForXp: true },
    });
    const totalXp = correctCount * 10;

    const completedLevels = completions.filter(
      (c) => c.completionPercent >= 100,
    ).length;

    const badgeIndex = Math.min(completedLevels, BADGES.length - 1);
    const badge = BADGES[badgeIndex];

    const levelsList = levels.map((level, idx) => {
      const completion = completionMap.get(level.id);
      const completionPercent = completion?.completionPercent ?? 0;
      const isCompleted = completionPercent >= 100;
      const attemptStats = levelAttemptsMap.get(level.id) ?? {
        attemptsCount: 0,
        correctAnswersCount: 0,
      };

      let isLocked = false;
      if (idx > 0) {
        const prevLevel = levels[idx - 1];
        const prevCompletion = completionMap.get(prevLevel.id);
        isLocked = !prevCompletion || prevCompletion.completionPercent < 100;
      }

      return {
        id: level.id,
        title: level.title,
        orderIndex: level.orderIndex,
        isLocked,
        isCompleted,
        completionPercent,
        correctAnswersCount: attemptStats.correctAnswersCount,
        attemptsCount: attemptStats.attemptsCount,
        completedAt: completion?.completedAt ?? null,
      };
    });

    return {
      totalXp,
      completedLevels,
      badge,
      levels: levelsList,
      hearts: orgId ? await this.heartsService.getMyHearts(userId, orgId) : null,
    };
  }

  async submitAnswer(userId: string, dto: SubmitAnswerDto) {
    const question = await this.questionRepo.findOne({
      where: { id: dto.questionId },
      relations: ['level', 'theory'],
    });
    if (!question) throw new NotFoundException('Savol topilmadi');

    // Variant aynan shu savolga tegishli bo'lishi shart — aks holda boshqa
    // savolning to'g'ri variant ID'si bilan javobni soxtalashtirish mumkin.
    const selectedOption = await this.optionRepo.findOne({
      where: { id: dto.selectedOptionId, questionId: dto.questionId },
    });
    if (!selectedOption) throw new NotFoundException('Variant topilmadi');

    const isCorrect = selectedOption.isCorrect;

    const correctOption = await this.optionRepo.findOne({
      where: { questionId: dto.questionId, isCorrect: true },
    });

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    const orgId = user?.organizations?.[0]?.organization?.id ?? null;
    if (!orgId) {
      throw new ForbiddenException(
        'Foydalanuvchi hech qanday tashkilotga biriktirilmagan',
      );
    }

    const attemptSource = dto.source ?? AttemptSource.LESSON;
    const duplicate = await this.findDuplicateAttempt(
      userId,
      dto.questionId,
      attemptSource,
    );
    if (duplicate) {
      const hearts = await this.heartsService.getMyHearts(userId, orgId);
      return {
        isCorrect: duplicate.isCorrect,
        correctOptionId: correctOption?.id ?? null,
        xpEarned: 0,
        countsForXp: false,
        xpDeniedReason: 'ALREADY_COUNTED' as const,
        xpMessage: duplicate.isCorrect
          ? 'Bu savol allaqachon javob berilgan. Takroriy ball berilmaydi.'
          : null,
        hearts,
        duplicate: true,
      };
    }

    // Faqat xato javob 1 energiya oladi. Energiya yetmasa consumeHeart
    // attempt yozilmasdan 403 (NO_HEARTS_LEFT) qaytaradi.
    const heartsAfter = isCorrect
      ? await this.heartsService.getMyHearts(userId, orgId)
      : await this.heartsService.consumeHeart(userId, orgId, 1);

    const xpMeta = await this.resolveXpEligibility(
      userId,
      dto.questionId,
      isCorrect,
      dto.source,
    );

    const attempt = this.attemptRepo.create({
      userId,
      organizationId: orgId,
      questionId: dto.questionId,
      selectedOptionId: dto.selectedOptionId,
      isCorrect,
      heartLost: !isCorrect,
      countsForXp: xpMeta.countsForXp,
      attemptSource: xpMeta.attemptSource,
    });
    try {
      await this.attemptRepo.save(attempt);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const hearts = await this.heartsService.getMyHearts(userId, orgId);
        return {
          isCorrect,
          correctOptionId: correctOption?.id ?? null,
          xpEarned: 0,
          countsForXp: false,
          xpDeniedReason: 'ALREADY_COUNTED' as const,
          xpMessage:
            'Bu savol allaqachon javob berilgan. Takroriy ball berilmaydi.',
          hearts,
          duplicate: true,
        };
      }
      throw err;
    }

    await this.recalcLevelCompletion(userId, question.levelId, orgId);

    return {
      isCorrect,
      correctOptionId: correctOption?.id ?? null,
      xpEarned: xpMeta.xpEarned,
      countsForXp: xpMeta.countsForXp,
      xpDeniedReason: xpMeta.xpDeniedReason,
      xpMessage: xpMeta.xpMessage,
      hearts: heartsAfter,
      duplicate: false,
    };
  }

  async submitMatching(userId: string, dto: SubmitMatchingDto) {
    const question = await this.questionRepo.findOne({
      where: { id: dto.questionId },
      relations: ['level', 'theory'],
    });
    if (!question) throw new NotFoundException('Savol topilmadi');
    if (question.type !== QuestionType.MATCHING) {
      throw new ForbiddenException('Bu savol MATCHING emas');
    }

    const options = await this.optionRepo.find({
      where: { questionId: dto.questionId },
    });
    if (!options.length) throw new NotFoundException('Variantlar topilmadi');

    const byId = new Map(options.map((o) => [o.id, o]));
    const n = options.length;

    if (!Array.isArray(dto.pairs) || dto.pairs.length !== n) {
      throw new ForbiddenException('Juftliklar soni noto‘g‘ri');
    }

    const usedLeft = new Set<string>();
    const usedRight = new Set<string>();
    let isCorrect = true;

    for (const p of dto.pairs) {
      const left = byId.get(p.leftOptionId);
      const right = byId.get(p.rightOptionId);
      if (!left || !right) throw new NotFoundException('Variant topilmadi');
      if (usedLeft.has(left.id) || usedRight.has(right.id)) {
        throw new ForbiddenException('Takrorlangan juftlik');
      }
      usedLeft.add(left.id);
      usedRight.add(right.id);
      if (left.id !== right.id) isCorrect = false;
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    const orgId = user?.organizations?.[0]?.organization?.id ?? null;
    if (!orgId) {
      throw new ForbiddenException(
        'Foydalanuvchi hech qanday tashkilotga biriktirilmagan',
      );
    }

    const attemptSource = dto.source ?? AttemptSource.LESSON;
    const duplicate = await this.findDuplicateAttempt(
      userId,
      dto.questionId,
      attemptSource,
    );
    if (duplicate) {
      const hearts = await this.heartsService.getMyHearts(userId, orgId);
      return {
        isCorrect: duplicate.isCorrect,
        xpEarned: 0,
        countsForXp: false,
        xpDeniedReason: 'ALREADY_COUNTED' as const,
        xpMessage: duplicate.isCorrect
          ? 'Bu savol allaqachon javob berilgan. Takroriy ball berilmaydi.'
          : null,
        hearts,
        duplicate: true,
      };
    }

    // Faqat xato javob 1 energiya oladi. Energiya yetmasa consumeHeart
    // attempt yozilmasdan 403 qaytaradi.
    const heartsAfter = isCorrect
      ? await this.heartsService.getMyHearts(userId, orgId)
      : await this.heartsService.consumeHeart(userId, orgId, 1);

    const xpMeta = await this.resolveXpEligibility(
      userId,
      dto.questionId,
      isCorrect,
      dto.source,
    );

    const attempt = this.attemptRepo.create({
      userId,
      organizationId: orgId,
      questionId: dto.questionId,
      selectedOptionId: dto.pairs[0]?.leftOptionId ?? options[0].id,
      isCorrect,
      heartLost: !isCorrect,
      countsForXp: xpMeta.countsForXp,
      attemptSource: xpMeta.attemptSource,
    });
    try {
      await this.attemptRepo.save(attempt);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        const hearts = await this.heartsService.getMyHearts(userId, orgId);
        return {
          isCorrect,
          xpEarned: 0,
          countsForXp: false,
          xpDeniedReason: 'ALREADY_COUNTED' as const,
          xpMessage:
            'Bu savol allaqachon javob berilgan. Takroriy ball berilmaydi.',
          hearts,
          duplicate: true,
        };
      }
      throw err;
    }

    await this.recalcLevelCompletion(userId, question.levelId, orgId);

    return {
      isCorrect,
      xpEarned: xpMeta.xpEarned,
      countsForXp: xpMeta.countsForXp,
      xpDeniedReason: xpMeta.xpDeniedReason,
      xpMessage: xpMeta.xpMessage,
      hearts: heartsAfter,
      duplicate: false,
    };
  }

  async getLevelDetail(userId: string, levelId: string) {
    const levels = await this.getPositionAvailableLevels(userId);
    const level = levels.find((l) => l.id === levelId);
    if (!level) throw new NotFoundException('Level topilmadi');

    const levelIndex = levels.findIndex((l) => l.id === levelId);
    if (levelIndex > 0) {
      const prevLevel = levels[levelIndex - 1];
      const prevCompletion = await this.completionRepo.findOne({
        where: { userId, levelId: prevLevel.id },
      });
      if (!prevCompletion || prevCompletion.completionPercent < 100) {
        throw new ForbiddenException('Bu level hali qulflangan');
      }
    }

    const roots = await this.theoryRepo.find({
      where: { levelId, parentTheoryId: IsNull() },
      order: { orderIndex: 'ASC' },
    });

    const theoriesWithProgress = await Promise.all(
      roots.map(async (theory) => {
        const children = await this.theoryRepo.find({
          where: { parentTheoryId: theory.id },
          order: { orderIndex: 'ASC' },
        });
        const naz =
          children.find((c) => c.theoryRole === TheoryRole.NAZARIYA) ??
          children.find((c) => c.title.endsWith(' · Nazariya'));
        const quizTheoryId = theory.id;

        const totalQuestions = await this.questionRepo.count({
          where: { theoryId: quizTheoryId },
        });

        const answeredQuestions = await this.attemptRepo
          .createQueryBuilder('a')
          .select('COUNT(DISTINCT a.questionId)', 'cnt')
          .where('a.userId = :userId', { userId })
          .andWhere((qb) => {
            const subQuery = qb
              .subQuery()
              .select('q.id')
              .from(Question, 'q')
              .where('q.theoryId = :theoryId')
              .getQuery();
            return `a.questionId IN ${subQuery}`;
          })
          .setParameters({ userId, theoryId: quizTheoryId })
          .getRawOne<{ cnt: string }>();

        const readParts = [theory.content?.trim(), naz?.content?.trim()].filter(Boolean);
        const readContent = readParts.join('\n\n') || '';

        return {
          id: theory.id,
          title: theory.title,
          content: readContent,
          orderIndex: theory.orderIndex,
          totalQuestions,
          answeredQuestions: parseInt(answeredQuestions?.cnt ?? '0', 10),
          quizTheoryId,
        };
      }),
    );

    return {
      id: level.id,
      title: level.title,
      orderIndex: level.orderIndex,
      theories: theoriesWithProgress,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    if (!(err instanceof QueryFailedError)) return false;
    const code = (err as QueryFailedError & { driverError?: { code?: string } })
      .driverError?.code;
    return code === '23505';
  }

  /**
   * Takroriy submit himoyasi (DB unique: user+savol+Toshkent kuni).
   * Bir kunda bir savolga faqat 1 ta urinish.
   */
  private async findDuplicateAttempt(
    userId: string,
    questionId: string,
    _source: AttemptSource,
  ): Promise<UserQuestionAttempt | null> {
    return this.attemptRepo
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.question_id = :questionId', { questionId })
      .andWhere(
        `(a.answered_at AT TIME ZONE 'Asia/Tashkent')::date = (NOW() AT TIME ZONE 'Asia/Tashkent')::date`,
      )
      .orderBy('a.answered_at', 'DESC')
      .take(1)
      .getOne();
  }

  /**
   * XP faqat kunlik majburiyatdan: DAILY_PLAN + yangi noyob to‘g‘ri + kunlik limit ichida.
   * LESSON / plandan tashqari → 0 XP.
   */
  private async resolveXpEligibility(
    userId: string,
    questionId: string,
    isCorrect: boolean,
    source?: AttemptSource,
  ): Promise<{
    countsForXp: boolean;
    xpEarned: number;
    attemptSource: AttemptSource;
    xpDeniedReason: 'WRONG' | 'OFF_PLAN' | 'PLAN_COMPLETE' | 'ALREADY_COUNTED' | null;
    xpMessage: string | null;
  }> {
    const attemptSource = source ?? AttemptSource.LESSON;
    const offPlanMessage =
      'Ushbu javob uchun ball berilmaydi. Ball faqat kunlik majburiyat uchun beriladi.';

    if (!isCorrect) {
      return {
        countsForXp: false,
        xpEarned: 0,
        attemptSource,
        xpDeniedReason: 'WRONG',
        xpMessage: null,
      };
    }

    if (attemptSource !== AttemptSource.DAILY_PLAN) {
      return {
        countsForXp: false,
        xpEarned: 0,
        attemptSource,
        xpDeniedReason: 'OFF_PLAN',
        xpMessage: offPlanMessage,
      };
    }

    const { from, to } = tashkentDayBounds(tashkentToday());

    const distinctRow = await this.attemptRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.question_id)', 'cnt')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.is_correct = true')
      .andWhere('a.counts_for_xp = true')
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', { from, to })
      .getRawOne<{ cnt: string }>();

    const planCorrectToday = Number(distinctRow?.cnt ?? 0);

    const alreadyCounted = await this.attemptRepo
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.question_id = :questionId', { questionId })
      .andWhere('a.is_correct = true')
      .andWhere('a.counts_for_xp = true')
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', { from, to })
      .getCount();

    if (alreadyCounted > 0) {
      return {
        countsForXp: false,
        xpEarned: 0,
        attemptSource,
        xpDeniedReason: 'ALREADY_COUNTED',
        xpMessage: offPlanMessage,
      };
    }

    if (planCorrectToday >= DAILY_GOAL_CORRECT) {
      return {
        countsForXp: false,
        xpEarned: 0,
        attemptSource,
        xpDeniedReason: 'PLAN_COMPLETE',
        xpMessage: offPlanMessage,
      };
    }

    return {
      countsForXp: true,
      xpEarned: 10,
      attemptSource,
      xpDeniedReason: null,
      xpMessage: null,
    };
  }

  private async recalcLevelCompletion(
    userId: string,
    levelId: string,
    organizationId: string,
  ) {
    const totalQuestions = await this.questionRepo.count({
      where: { levelId },
    });
    if (totalQuestions === 0) return;

    const answeredResult = await this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin('a.question', 'q')
      .select('COUNT(DISTINCT a.question_id)', 'cnt')
      .where('a.userId = :userId', { userId })
      .andWhere('q.levelId = :levelId', { levelId })
      .setParameters({ userId, levelId })
      .getRawOne<{ cnt: string }>();

    const answered = parseInt(answeredResult?.cnt ?? '0', 10);
    const percent = Math.round((answered / totalQuestions) * 100);

    let completion = await this.completionRepo.findOne({
      where: { userId, levelId },
    });

    if (!completion) {
      completion = this.completionRepo.create({
        userId,
        levelId,
        organizationId,
        completionPercent: percent,
        completedAt: percent >= 100 ? new Date() : null,
      });
    } else {
      completion.completionPercent = percent;
      if (percent >= 100 && !completion.completedAt) {
        completion.completedAt = new Date();
      }
    }

    await this.completionRepo.save(completion);
  }
}
