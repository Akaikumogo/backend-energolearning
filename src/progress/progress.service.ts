import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { HeartsService } from '../hearts/hearts.service';

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

  async getMyProgress(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    const orgId = user.organizations?.[0]?.organization?.id ?? null;

    const levels = await this.levelRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC' },
    });

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

    const selectedOption = await this.optionRepo.findOne({
      where: { id: dto.selectedOptionId },
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
    const orgId = user?.organizations?.[0]?.organization?.id ?? '';

    const attempt = this.attemptRepo.create({
      userId,
      organizationId: orgId,
      questionId: dto.questionId,
      selectedOptionId: dto.selectedOptionId,
      isCorrect,
    });
    await this.attemptRepo.save(attempt);

    if (!isCorrect && orgId) {
      await this.heartsService.consumeHeart(userId, orgId, 1);
    }

    await this.recalcLevelCompletion(userId, question.levelId, orgId);

    return {
      isCorrect,
      correctOptionId: correctOption?.id ?? null,
      xpEarned: isCorrect ? 10 : 0,
    };
  }

  async getLevelDetail(userId: string, levelId: string) {
    const level = await this.levelRepo.findOne({ where: { id: levelId } });
    if (!level) throw new NotFoundException('Level topilmadi');

    const levels = await this.levelRepo.find({
      where: { isActive: true },
      order: { orderIndex: 'ASC' },
    });
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
        const mash = children.find((c) => c.title.endsWith(' · Mashq'));
        const naz = children.find((c) => c.title.endsWith(' · Nazariya'));
        const quizTheoryId = mash?.id ?? theory.id;

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
