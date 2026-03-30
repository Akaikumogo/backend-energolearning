import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnalyticsSummaryDto,
  LevelFunnelItemDto,
  QuestionErrorDto,
} from './dto/analytics-summary.dto';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { Role } from '../common/enums/role.enum';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Level } from '../database/entities/level.entity';
import { Question } from '../database/entities/question.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(Level)
    private readonly levelRepo: Repository<Level>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(UserLevelCompletion)
    private readonly ulcRepo: Repository<UserLevelCompletion>,
    @InjectRepository(UserQuestionAttempt)
    private readonly uqaRepo: Repository<UserQuestionAttempt>,
  ) {}

  async getSummary(orgId: string): Promise<AnalyticsSummaryDto> {
    const isAll = orgId === 'all';

    const totalOrganizations = isAll
      ? await this.orgRepo.count()
      : await this.orgRepo.count({ where: { id: orgId } });

    const totalUsers = isAll
      ? await this.usersRepo.count()
      : await this.userOrgRepo.count({
          where: { organization: { id: orgId } },
        });

    const totalModerators = await this.usersRepo.count({
      where: { role: Role.MODERATOR },
    });

    const totalLevels = await this.levelRepo.count();
    const totalQuestions = await this.questionRepo.count();

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers7d = await this.refreshRepo
      .createQueryBuilder('rt')
      .leftJoin('rt.user', 'u')
      .leftJoin('u.organizations', 'uo')
      .leftJoin('uo.organization', 'o')
      .where('rt.created_at >= :since', { since })
      .andWhere(isAll ? '1=1' : 'o.id = :orgId', { orgId })
      .select('u.id', 'userId')
      .distinct(true)
      .getRawMany()
      .then((rows) => rows.length);

    return {
      totalUsers,
      activeUsers7d,
      totalOrganizations,
      totalModerators,
      totalLevels,
      totalQuestions,
      orgId,
    };
  }

  async getLevelFunnel(orgId: string): Promise<LevelFunnelItemDto[]> {
    const isAll = orgId === 'all';
    const levels = await this.levelRepo.find({
      order: { orderIndex: 'ASC' },
    });

    const result: LevelFunnelItemDto[] = [];

    for (const level of levels) {
      const startedQb = this.ulcRepo
        .createQueryBuilder('ulc')
        .where('ulc.level_id = :levelId', { levelId: level.id });
      if (!isAll) {
        startedQb.andWhere('ulc.organization_id = :orgId', { orgId });
      }
      const totalStarted = await startedQb.getCount();

      const completedQb = this.ulcRepo
        .createQueryBuilder('ulc')
        .where('ulc.level_id = :levelId', { levelId: level.id })
        .andWhere('ulc.completion_percent = 100');
      if (!isAll) {
        completedQb.andWhere('ulc.organization_id = :orgId', { orgId });
      }
      const totalCompleted = await completedQb.getCount();

      result.push({
        levelId: level.id,
        levelTitle: level.title,
        orderIndex: level.orderIndex,
        totalStarted,
        totalCompleted,
      });
    }

    return result;
  }

  async getQuestionErrors(orgId: string): Promise<QuestionErrorDto[]> {
    const isAll = orgId === 'all';

    const qb = this.uqaRepo
      .createQueryBuilder('uqa')
      .leftJoin('uqa.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)::int', 'totalAttempts')
      .addSelect(
        'COUNT(*) FILTER (WHERE uqa.is_correct = false)::int',
        'wrongAttempts',
      )
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .orderBy('"wrongAttempts"', 'DESC')
      .limit(20);

    if (!isAll) {
      qb.andWhere('uqa.organization_id = :orgId', { orgId });
    }

    const raw: {
      questionId: string;
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
      totalAttempts: number;
      wrongAttempts: number;
    }[] = await qb.getRawMany();

    return raw.map((r) => ({
      ...r,
      errorRate:
        r.totalAttempts > 0
          ? Math.round((r.wrongAttempts / r.totalAttempts) * 100)
          : 0,
    }));
  }
}
