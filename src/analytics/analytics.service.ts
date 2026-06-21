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

  /**
   * Hamma KPI larni bitta runda parallel COUNT() bilan yig'amiz.
   * Avval ketma-ket 6 ta await edi — endi Promise.all.
   */
  async getSummary(orgId: string): Promise<AnalyticsSummaryDto> {
    const isAll = orgId === 'all';
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const usersCountQb = isAll
      ? this.usersRepo.createQueryBuilder('u').select('COUNT(*)::int', 'c')
      : this.userOrgRepo
          .createQueryBuilder('uo')
          .innerJoin('uo.user', 'u')
          .where('uo.organization = :orgId', { orgId })
          .select('COUNT(DISTINCT u.id)::int', 'c');

    const orgCountQb = isAll
      ? this.orgRepo.createQueryBuilder('o').select('COUNT(*)::int', 'c')
      : this.orgRepo
          .createQueryBuilder('o')
          .where('o.id = :orgId', { orgId })
          .select('COUNT(*)::int', 'c');

    const modCountQb = (() => {
      const qb = this.usersRepo
        .createQueryBuilder('u')
        .where('u.role = :role', { role: Role.MODERATOR });
      if (!isAll) {
        qb.innerJoin('u.organizations', 'uo').andWhere(
          'uo.organization = :orgId',
          { orgId },
        );
      }
      return qb.select('COUNT(DISTINCT u.id)::int', 'c');
    })();

    const levelCountQb = this.levelRepo
      .createQueryBuilder('l')
      .select('COUNT(*)::int', 'c');
    const questionCountQb = this.questionRepo
      .createQueryBuilder('q')
      .select('COUNT(*)::int', 'c');

    const active7dQb = this.refreshRepo
      .createQueryBuilder('rt')
      .innerJoin('rt.user', 'u')
      .where('rt.createdAt >= :since', { since })
      .select('COUNT(DISTINCT u.id)::int', 'c');
    if (!isAll) {
      active7dQb
        .innerJoin('u.organizations', 'uo')
        .andWhere('uo.organization = :orgId', { orgId });
    }

    const [
      usersRow,
      orgRow,
      modRow,
      levelRow,
      questionRow,
      activeRow,
    ] = await Promise.all([
      usersCountQb.getRawOne<{ c: number }>(),
      orgCountQb.getRawOne<{ c: number }>(),
      modCountQb.getRawOne<{ c: number }>(),
      levelCountQb.getRawOne<{ c: number }>(),
      questionCountQb.getRawOne<{ c: number }>(),
      active7dQb.getRawOne<{ c: number }>(),
    ]);

    return {
      totalUsers: Number(usersRow?.c) || 0,
      activeUsers7d: Number(activeRow?.c) || 0,
      totalOrganizations: Number(orgRow?.c) || 0,
      totalModerators: Number(modRow?.c) || 0,
      totalLevels: Number(levelRow?.c) || 0,
      totalQuestions: Number(questionRow?.c) || 0,
      orgId,
    };
  }

  /**
   * Asl kod har level uchun 2 ta query qilardi (N+1).
   * Endi bitta GROUP BY query — barcha leveller uchun.
   */
  async getLevelFunnel(orgId: string): Promise<LevelFunnelItemDto[]> {
    const isAll = orgId === 'all';

    const qb = this.ulcRepo
      .createQueryBuilder('ulc')
      .innerJoin('ulc.level', 'l')
      .select('l.id', 'levelId')
      .addSelect('l.title', 'levelTitle')
      .addSelect('l.order_index', 'orderIndex')
      .addSelect('COUNT(ulc.id)::int', 'totalStarted')
      .addSelect(
        `COUNT(*) FILTER (WHERE ulc.completion_percent = 100)::int`,
        'totalCompleted',
      )
      .groupBy('l.id')
      .addGroupBy('l.title')
      .addGroupBy('l.order_index')
      .orderBy('l.order_index', 'ASC');

    if (!isAll) {
      qb.where('ulc.organization_id = :orgId', { orgId });
    }

    const aggregated = await qb.getRawMany<{
      levelId: string;
      levelTitle: string;
      orderIndex: number;
      totalStarted: number;
      totalCompleted: number;
    }>();

    // Hech kim boshlamagan levellar ham ko'rinishi uchun, barcha levellar
    // bilan birlashtiramiz (LEFT OUTER ma'nosida).
    const allLevels = await this.levelRepo.find({
      order: { orderIndex: 'ASC' },
    });
    const map = new Map(aggregated.map((r) => [r.levelId, r]));

    return allLevels.map((l) => {
      const a = map.get(l.id);
      return {
        levelId: l.id,
        levelTitle: l.title,
        orderIndex: l.orderIndex,
        totalStarted: Number(a?.totalStarted) || 0,
        totalCompleted: Number(a?.totalCompleted) || 0,
      };
    });
  }

  async getQuestionErrors(orgId: string): Promise<QuestionErrorDto[]> {
    const isAll = orgId === 'all';

    const qb = this.uqaRepo
      .createQueryBuilder('uqa')
      .innerJoin('uqa.question', 'q')
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
      // Faqat kamida 1 marta xato bo'lgan savollar
      .having('COUNT(*) FILTER (WHERE uqa.is_correct = false) > 0')
      .orderBy('"wrongAttempts"', 'DESC')
      .limit(20);

    if (!isAll) {
      qb.where('uqa.organization_id = :orgId', { orgId });
    }

    const raw = await qb.getRawMany<{
      questionId: string;
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
      totalAttempts: number;
      wrongAttempts: number;
    }>();

    return raw.map((r) => ({
      questionId: r.questionId,
      prompt: r.prompt,
      levelTitle: r.levelTitle,
      theoryTitle: r.theoryTitle,
      totalAttempts: Number(r.totalAttempts) || 0,
      wrongAttempts: Number(r.wrongAttempts) || 0,
      errorRate:
        r.totalAttempts > 0
          ? Math.round((Number(r.wrongAttempts) / Number(r.totalAttempts)) * 100)
          : 0,
    }));
  }

  async getHeartsLost(
    orgId: string,
    range: 'today' | 'month' | 'year',
  ): Promise<{
    orgId: string;
    range: { from: string; to: string };
    byUser: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      lostHearts: number;
    }>;
    byQuestion: Array<{
      questionId: string;
      prompt: string;
      levelTitle: string;
      theoryTitle: string;
      lostHearts: number;
    }>;
  }> {
    const isAll = orgId === 'all';
    const { from, to } = this.rangeBoundsTashkent(range);

    const byUserQb = this.uqaRepo
      .createQueryBuilder('uqa')
      .innerJoin('uqa.user', 'u')
      .select('u.id', 'userId')
      .addSelect('u.first_name', 'firstName')
      .addSelect('u.last_name', 'lastName')
      .addSelect('u.email', 'email')
      .addSelect('COUNT(*)::int', 'lostHearts')
      .where('uqa.answered_at >= :from', { from })
      .andWhere('uqa.answered_at < :to', { to })
      .andWhere('uqa.is_correct = false')
      .groupBy('u.id')
      .addGroupBy('u.first_name')
      .addGroupBy('u.last_name')
      .addGroupBy('u.email')
      .orderBy('"lostHearts"', 'DESC')
      .limit(50);

    if (!isAll) {
      byUserQb.andWhere('uqa.organization_id = :orgId', { orgId });
    }

    const byQuestionQb = this.uqaRepo
      .createQueryBuilder('uqa')
      .innerJoin('uqa.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .select('q.id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('COUNT(*)::int', 'lostHearts')
      .where('uqa.answered_at >= :from', { from })
      .andWhere('uqa.answered_at < :to', { to })
      .andWhere('uqa.is_correct = false')
      .groupBy('q.id')
      .addGroupBy('q.prompt')
      .addGroupBy('l.title')
      .addGroupBy('t.title')
      .orderBy('"lostHearts"', 'DESC')
      .limit(50);

    if (!isAll) {
      byQuestionQb.andWhere('uqa.organization_id = :orgId', { orgId });
    }

    const [byUser, byQuestion] = await Promise.all([
      byUserQb.getRawMany<{
        userId: string;
        firstName: string;
        lastName: string;
        email: string;
        lostHearts: number;
      }>(),
      byQuestionQb.getRawMany<{
        questionId: string;
        prompt: string;
        levelTitle: string;
        theoryTitle: string;
        lostHearts: number;
      }>(),
    ]);

    return {
      orgId,
      range: { from: from.toISOString(), to: to.toISOString() },
      byUser: byUser.map((r) => ({
        userId: r.userId,
        firstName: r.firstName ?? '',
        lastName: r.lastName ?? '',
        email: r.email ?? '',
        lostHearts: Number(r.lostHearts) || 0,
      })),
      byQuestion: byQuestion.map((r) => ({
        questionId: r.questionId,
        prompt: r.prompt ?? '',
        levelTitle: r.levelTitle ?? '',
        theoryTitle: r.theoryTitle ?? '',
        lostHearts: Number(r.lostHearts) || 0,
      })),
    };
  }

  /**
   * Toshkent (UTC+5) kun chegaralari. Asl kod server timezone'i bilan
   * `setHours(0,0,0,0)` qilardi — UTC serverda noto'g'ri natija.
   */
  private rangeBoundsTashkent(range: 'today' | 'month' | 'year') {
    const offsetMs = 5 * 3600 * 1000;
    const now = new Date();
    const t = new Date(now.getTime() + offsetMs); // "Tashkent-fake-UTC"

    let fromT: Date;
    let toT: Date;
    if (range === 'today') {
      fromT = new Date(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()),
      );
      toT = new Date(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1),
      );
    } else if (range === 'month') {
      fromT = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      toT = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
    } else {
      fromT = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      toT = new Date(Date.UTC(t.getUTCFullYear() + 1, 0, 1));
    }

    return {
      from: new Date(fromT.getTime() - offsetMs),
      to: new Date(toT.getTime() - offsetMs),
    };
  }
}
