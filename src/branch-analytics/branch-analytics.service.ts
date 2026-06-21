import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { DailyPlan } from '../database/entities/daily-plan.entity';
import { Organization } from '../database/entities/organization.entity';
import { Question } from '../database/entities/question.entity';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { DailyPlanService, MIN_DAILY_PLAN_QUESTIONS } from './daily-plan.service';

export type DayStatus = 'active' | 'offline' | 'never';

@Injectable()
export class BranchAnalyticsService {
  constructor(
    private readonly orgService: OrganizationsService,
    private readonly dailyPlanService: DailyPlanService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    @InjectRepository(DailyPlan)
    private readonly planRepo: Repository<DailyPlan>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async resolveOrgScope(
    orgId: string,
    user: { role: Role; organizationIds: string[] },
  ): Promise<string> {
    if (!orgId?.trim()) {
      throw new NotFoundException('orgId majburiy');
    }
    if (user.role === Role.MODERATOR) {
      const scoped = await this.orgService.resolveModeratorScope(
        user.organizationIds,
      );
      if (scoped && scoped.length > 0 && !scoped.includes(orgId)) {
        throw new ForbiddenException('Ruxsat yo`q');
      }
    }
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');
    return orgId;
  }

  private parseRange(from?: string, to?: string): { from: Date; to: Date } {
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const start = from
      ? new Date(`${from}T00:00:00.000Z`)
      : (() => {
          const d = new Date(end);
          d.setDate(d.getDate() - 27);
          d.setHours(0, 0, 0, 0);
          return d;
        })();
    return { from: start, to: end };
  }

  private listDays(from: Date, to: Date): string[] {
    const days: string[] = [];
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }

  async getEmployeeIds(orgId: string): Promise<
    Array<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
    }>
  > {
    return this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id = :orgId', { orgId })
      .andWhere('u.role = :role', { role: Role.USER })
      .select([
        'u.id AS "userId"',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.email AS "email"',
      ])
      .orderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .getRawMany();
  }

  async getSummary(
    orgId: string,
    from?: string,
    to?: string,
  ) {
    const { from: rangeFrom, to: rangeTo } = this.parseRange(from, to);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    if (userIds.length === 0) {
      return {
        orgId,
        range: {
          from: rangeFrom.toISOString().slice(0, 10),
          to: rangeTo.toISOString().slice(0, 10),
        },
        totalEmployees: 0,
        firstLoginCount: 0,
        quizTakersCount: 0,
        activeTodayCount: 0,
        offlineEmployeesCount: 0,
        dailyPlanTarget: MIN_DAILY_PLAN_QUESTIONS,
      };
    }

    const firstLoginRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('MIN(s.login_at)', 'firstLogin')
      .where('s.user_id IN (:...userIds)', { userIds })
      .andWhere('s.organization_id = :orgId', { orgId })
      .groupBy('s.user_id')
      .getRawMany<{ userId: string; firstLogin: Date }>();

    const firstLoginCount = firstLoginRows.length;

    const quizTakers = await this.attemptRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at BETWEEN :from AND :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .getRawMany();
    const quizTakersCount = quizTakers.length;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const activeToday = await this.attemptRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at BETWEEN :from AND :to', {
        from: todayStart,
        to: todayEnd,
      })
      .getRawMany();

    const activeTodayIds = new Set(activeToday.map((r) => r.userId));

    const activeInRange = await this.attemptRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at BETWEEN :from AND :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .getRawMany();
    const activeInRangeIds = new Set(activeInRange.map((r) => r.userId));
    const offlineEmployeesCount = userIds.filter(
      (id) => !activeInRangeIds.has(id),
    ).length;

    return {
      orgId,
      range: {
        from: rangeFrom.toISOString().slice(0, 10),
        to: rangeTo.toISOString().slice(0, 10),
      },
      totalEmployees: employees.length,
      firstLoginCount,
      quizTakersCount,
      activeTodayCount: activeTodayIds.size,
      offlineEmployeesCount,
      dailyPlanTarget: MIN_DAILY_PLAN_QUESTIONS,
    };
  }

  async getActivityMatrix(orgId: string, from?: string, to?: string) {
    const { from: rangeFrom, to: rangeTo } = this.parseRange(from, to);
    const days = this.listDays(rangeFrom, rangeTo);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    if (userIds.length === 0) {
      return { orgId, days, employees: [] };
    }

    const attemptRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect("TO_CHAR(a.answered_at, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)::int', 'count')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at BETWEEN :from AND :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .groupBy('a.user_id')
      .addGroupBy("TO_CHAR(a.answered_at, 'YYYY-MM-DD')")
      .getRawMany<{ userId: string; day: string; count: number }>();

    const sessionRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect("TO_CHAR(s.login_at, 'YYYY-MM-DD')", 'day')
      .where('s.user_id IN (:...userIds)', { userIds })
      .andWhere('s.organization_id = :orgId', { orgId })
      .andWhere('s.login_at BETWEEN :from AND :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .groupBy('s.user_id')
      .addGroupBy("TO_CHAR(s.login_at, 'YYYY-MM-DD')")
      .getRawMany<{ userId: string; day: string }>();

    const firstLoginRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('MIN(s.login_at)', 'firstLogin')
      .where('s.user_id IN (:...userIds)', { userIds })
      .groupBy('s.user_id')
      .getRawMany<{ userId: string; firstLogin: Date | null }>();
    const everLoggedIn = new Set(
      firstLoginRows.filter((r) => r.firstLogin).map((r) => r.userId),
    );

    const activityMap = new Map<string, Set<string>>();
    for (const row of attemptRows) {
      if (!activityMap.has(row.userId)) activityMap.set(row.userId, new Set());
      activityMap.get(row.userId)!.add(row.day);
    }
    for (const row of sessionRows) {
      if (!activityMap.has(row.userId)) activityMap.set(row.userId, new Set());
      activityMap.get(row.userId)!.add(row.day);
    }

    const attemptCountMap = new Map<string, number>();
    for (const row of attemptRows) {
      attemptCountMap.set(`${row.userId}:${row.day}`, row.count);
    }

    return {
      orgId,
      days,
      employees: employees.map((emp) => ({
        userId: emp.userId,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        email: emp.email,
        hasEverLoggedIn: everLoggedIn.has(emp.userId),
        days: days.map((day) => {
          const active = activityMap.get(emp.userId)?.has(day) ?? false;
          let status: DayStatus;
          if (active) {
            status = 'active';
          } else if (!everLoggedIn.has(emp.userId)) {
            status = 'never';
          } else {
            status = 'offline';
          }
          return {
            date: day,
            status,
            attemptCount: attemptCountMap.get(`${emp.userId}:${day}`) ?? 0,
          };
        }),
      })),
    };
  }

  async getDailyPlanResult(orgId: string, date?: string) {
    const planDate = date ?? this.dailyPlanService.formatDate(new Date());
    const plan = await this.dailyPlanService.ensurePlan(
      orgId,
      new Date(`${planDate}T12:00:00.000Z`),
    );

    const questions = plan.questionIds.length
      ? await this.questionRepo.find({
          where: plan.questionIds.map((id) => ({ id })),
          relations: ['level', 'theory'],
        })
      : [];

    const questionOrder = new Map(plan.questionIds.map((id, i) => [id, i]));
    questions.sort(
      (a, b) => (questionOrder.get(a.id) ?? 0) - (questionOrder.get(b.id) ?? 0),
    );

    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);
    const dayStart = new Date(`${planDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${planDate}T23:59:59.999Z`);

    let userResults: Array<{
      userId: string;
      fullName: string;
      answeredCount: number;
      correctCount: number;
      completed: boolean;
      completionPercent: number;
    }> = [];

    if (userIds.length > 0 && plan.questionIds.length > 0) {
      const attemptRows = await this.attemptRepo
        .createQueryBuilder('a')
        .select('a.user_id', 'userId')
        .addSelect('a.question_id', 'questionId')
        .addSelect('BOOL_OR(a.is_correct)', 'isCorrect')
        .where('a.user_id IN (:...userIds)', { userIds })
        .andWhere('a.organization_id = :orgId', { orgId })
        .andWhere('a.question_id IN (:...qids)', { qids: plan.questionIds })
        .andWhere('a.answered_at BETWEEN :from AND :to', {
          from: dayStart,
          to: dayEnd,
        })
        .groupBy('a.user_id')
        .addGroupBy('a.question_id')
        .getRawMany<{
          userId: string;
          questionId: string;
          isCorrect: boolean;
        }>();

      const byUser = new Map<
        string,
        { answered: Set<string>; correct: Set<string> }
      >();
      for (const row of attemptRows) {
        if (!byUser.has(row.userId)) {
          byUser.set(row.userId, { answered: new Set(), correct: new Set() });
        }
        const u = byUser.get(row.userId)!;
        u.answered.add(row.questionId);
        if (row.isCorrect) u.correct.add(row.questionId);
      }

      userResults = employees.map((emp) => {
        const stats = byUser.get(emp.userId) ?? {
          answered: new Set<string>(),
          correct: new Set<string>(),
        };
        const answeredCount = stats.answered.size;
        const correctCount = stats.correct.size;
        const target = plan.questionIds.length;
        const completionPercent =
          target > 0 ? Math.round((answeredCount / target) * 100) : 0;
        return {
          userId: emp.userId,
          fullName: `${emp.lastName} ${emp.firstName}`.trim(),
          answeredCount,
          correctCount,
          completed: answeredCount >= target,
          completionPercent,
        };
      });
    }

    const completedCount = userResults.filter((u) => u.completed).length;

    return {
      orgId,
      planDate,
      questionCount: plan.questionIds.length,
      targetQuestions: MIN_DAILY_PLAN_QUESTIONS,
      completedEmployees: completedCount,
      totalEmployees: employees.length,
      questions: questions.map((q, idx) => ({
        id: q.id,
        orderIndex: idx + 1,
        prompt: q.prompt,
        levelTitle: q.level?.title ?? '',
        theoryTitle: q.theory?.title ?? '',
      })),
      userResults,
    };
  }

  async getMobileDailyPlan(userId: string, organizationId: string) {
    const plan = await this.dailyPlanService.ensurePlan(
      organizationId,
      new Date(),
    );
    const planDate = plan.planDate;
    const dayStart = new Date(`${planDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${planDate}T23:59:59.999Z`);

    const questions = plan.questionIds.length
      ? await this.questionRepo.find({
          where: plan.questionIds.map((id) => ({ id, isActive: true })),
          relations: ['options'],
        })
      : [];

    const questionOrder = new Map(plan.questionIds.map((id, i) => [id, i]));
    questions.sort(
      (a, b) => (questionOrder.get(a.id) ?? 0) - (questionOrder.get(b.id) ?? 0),
    );

    const attempts =
      plan.questionIds.length > 0
        ? await this.attemptRepo
            .createQueryBuilder('a')
            .select('a.question_id', 'questionId')
            .addSelect('BOOL_OR(a.is_correct)', 'isCorrect')
            .addSelect('COUNT(*)::int', 'attempts')
            .where('a.user_id = :userId', { userId })
            .andWhere('a.question_id IN (:...qids)', { qids: plan.questionIds })
            .andWhere('a.answered_at BETWEEN :from AND :to', {
              from: dayStart,
              to: dayEnd,
            })
            .groupBy('a.question_id')
            .getRawMany<{
              questionId: string;
              isCorrect: boolean;
              attempts: number;
            }>()
        : [];

    const attemptMap = new Map(
      attempts.map((a) => [
        a.questionId,
        { isCorrect: a.isCorrect, attempts: Number(a.attempts) },
      ]),
    );

    const answeredCount = attemptMap.size;
    const target = plan.questionIds.length;

    return {
      planDate,
      organizationId,
      targetQuestions: MIN_DAILY_PLAN_QUESTIONS,
      questionCount: target,
      answeredCount,
      completionPercent:
        target > 0 ? Math.round((answeredCount / target) * 100) : 0,
      completed: answeredCount >= target && target >= MIN_DAILY_PLAN_QUESTIONS,
      questions: questions.map((q, idx) => ({
        id: q.id,
        orderIndex: idx + 1,
        prompt: q.prompt,
        type: q.type,
        options: (q.options ?? [])
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => ({
            id: o.id,
            optionText: o.optionText,
            orderIndex: o.orderIndex,
            matchText: o.matchText ?? null,
          })),
        answered: attemptMap.has(q.id),
        isCorrect: attemptMap.get(q.id)?.isCorrect ?? null,
        attemptCount: attemptMap.get(q.id)?.attempts ?? 0,
      })),
    };
  }
}
