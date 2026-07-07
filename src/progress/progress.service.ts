import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { SubmitMatchingDto } from './dto/submit-matching.dto';
import { HeartsService } from '../hearts/hearts.service';
import { TheoryRole } from '../common/enums/theory-role.enum';
import { QuestionType } from '../common/enums/question-type.enum';

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

    const correctCount = await this.attemptRepo.count({
      where: { userId, isCorrect: true },
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

    // Har bir urinish (to'g'ri yoki noto'g'ri) 1 energiya sarflaydi — bu
    // taxmin qilib bosishning oldini oladi. Energiya yetmasa consumeHeart
    // attempt yozilmasdan 403 (NO_HEARTS_LEFT) qaytaradi.
    const heartsAfter = await this.heartsService.consumeHeart(userId, orgId, 1);

    const attempt = this.attemptRepo.create({
      userId,
      organizationId: orgId,
      questionId: dto.questionId,
      selectedOptionId: dto.selectedOptionId,
      isCorrect,
      heartLost: !isCorrect,
    });
    await this.attemptRepo.save(attempt);

    await this.recalcLevelCompletion(userId, question.levelId, orgId);

    return {
      isCorrect,
      correctOptionId: correctOption?.id ?? null,
      xpEarned: isCorrect ? 10 : 0,
      hearts: heartsAfter,
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

    // Har bir urinish (to'g'ri yoki noto'g'ri) 1 energiya sarflaydi.
    // Energiya yetmasa consumeHeart attempt yozilmasdan 403 qaytaradi.
    const heartsAfter = await this.heartsService.consumeHeart(userId, orgId, 1);

    const attempt = this.attemptRepo.create({
      userId,
      organizationId: orgId,
      questionId: dto.questionId,
      selectedOptionId: dto.pairs[0]?.leftOptionId ?? options[0].id,
      isCorrect,
      heartLost: !isCorrect,
    });
    await this.attemptRepo.save(attempt);

    await this.recalcLevelCompletion(userId, question.levelId, orgId);

    return { isCorrect, xpEarned: isCorrect ? 10 : 0, hearts: heartsAfter };
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
