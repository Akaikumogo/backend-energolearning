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
import {
  DAILY_GOAL_CORRECT,
  DailyPlanService,
  MIN_DAILY_PLAN_QUESTIONS,
} from './daily-plan.service';

export type DayStatus = 'active' | 'offline' | 'never';

const TZ_OFFSET_MS = 5 * 3600 * 1000; // Asia/Tashkent (UTC+5, DST yo'q)

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

  /** Toshkent bo'yicha bugungi sana (YYYY-MM-DD). */
  private tashkentToday(): string {
    return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
  }

  /** Toshkent kuni chegaralari (UTC instantlarda). */
  private tashkentDayBounds(dateStr: string): { from: Date; to: Date } {
    const from = new Date(`${dateStr}T00:00:00.000+05:00`);
    return { from, to: new Date(from.getTime() + 24 * 3600 * 1000) };
  }

  /** Oy chegaralari va oy kunlari soni. month: YYYY-MM (Toshkent). */
  private tashkentMonthBounds(month?: string): {
    month: string;
    daysInMonth: number;
    from: Date;
    to: Date;
  } {
    const m = /^\d{4}-\d{2}$/.test(month ?? '')
      ? (month as string)
      : this.tashkentToday().slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const from = new Date(`${m}-01T00:00:00.000+05:00`);
    const nextMonth =
      mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const to = new Date(`${nextMonth}-01T00:00:00.000+05:00`);
    return { month: m, daysInMonth, from, to };
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
        dailyGoalCorrect: DAILY_GOAL_CORRECT,
        planCompletedTodayCount: 0,
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

    // Bugun kunlik planni bajarganlar: Toshkent kuni ichida kamida
    // DAILY_GOAL_CORRECT ta har xil savolga to'g'ri javob berganlar.
    const { from: tFrom, to: tTo } = this.tashkentDayBounds(this.tashkentToday());
    const completedTodayRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.is_correct = true')
      .andWhere('a.answered_at >= :tFrom AND a.answered_at < :tTo', {
        tFrom,
        tTo,
      })
      .groupBy('a.user_id')
      .having('COUNT(DISTINCT a.question_id) >= :goal', {
        goal: DAILY_GOAL_CORRECT,
      })
      .getRawMany();

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
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      planCompletedTodayCount: completedTodayRows.length,
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
    const { from: dayStart, to: dayEnd } = this.tashkentDayBounds(planDate);

    // Yangi model: plan bajarilishi shu kunda DAILY_GOAL_CORRECT ta har xil
    // savolga TO'G'RI javob berish bilan o'lchanadi — savollar plan
    // ro'yxatidan bo'lishi shart emas (100 ta ishlab 10 tasini to'g'ri topsa
    // ham plan bajarilgan hisoblanadi).
    let userResults: Array<{
      userId: string;
      fullName: string;
      answeredCount: number;
      correctCount: number;
      completed: boolean;
      completionPercent: number;
    }> = [];

    if (userIds.length > 0) {
      const attemptRows = await this.attemptRepo
        .createQueryBuilder('a')
        .select('a.user_id', 'userId')
        .addSelect('COUNT(DISTINCT a.question_id)::int', 'answeredCount')
        .addSelect(
          'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
          'correctCount',
        )
        .where('a.user_id IN (:...userIds)', { userIds })
        .andWhere('a.organization_id = :orgId', { orgId })
        .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
          from: dayStart,
          to: dayEnd,
        })
        .groupBy('a.user_id')
        .getRawMany<{
          userId: string;
          answeredCount: number;
          correctCount: number;
        }>();

      const byUser = new Map(attemptRows.map((r) => [r.userId, r]));

      userResults = employees.map((emp) => {
        const stats = byUser.get(emp.userId);
        const answeredCount = Number(stats?.answeredCount) || 0;
        const correctCount = Number(stats?.correctCount) || 0;
        const completionPercent = Math.min(
          100,
          Math.round((correctCount / DAILY_GOAL_CORRECT) * 100),
        );
        return {
          userId: emp.userId,
          fullName: `${emp.lastName} ${emp.firstName}`.trim(),
          answeredCount,
          correctCount,
          completed: correctCount >= DAILY_GOAL_CORRECT,
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
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
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
    const { from: dayStart, to: dayEnd } = this.tashkentDayBounds(planDate);

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

    // Kunlik progress uchun shu kundagi (Toshkent) BARCHA urinishlar —
    // plan ro'yxati bilan cheklanmaydi.
    const attempts = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.question_id', 'questionId')
      .addSelect('BOOL_OR(a.is_correct)', 'isCorrect')
      .addSelect('COUNT(*)::int', 'attempts')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.organization_id = :organizationId', { organizationId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: dayStart,
        to: dayEnd,
      })
      .groupBy('a.question_id')
      .getRawMany<{
        questionId: string;
        isCorrect: boolean;
        attempts: number;
      }>();

    const attemptMap = new Map(
      attempts.map((a) => [
        a.questionId,
        { isCorrect: a.isCorrect, attempts: Number(a.attempts) },
      ]),
    );

    const target = plan.questionIds.length;
    const answeredCount = attemptMap.size;
    const correctCount = attempts.filter((a) => a.isCorrect).length;

    // Plan savollari tugab, maqsadga hali yetilmagan bo'lsa — qo'shimcha
    // random savollar beriladi (bugun urinilganlar takrorlanmaydi). Tartib
    // user+kun bo'yicha deterministik (MD5 seed) — har refetch'da o'zgarmaydi.
    const planAllAnswered = plan.questionIds.every((id) => attemptMap.has(id));
    let extraQuestions: Question[] = [];
    if (planAllAnswered && correctCount < DAILY_GOAL_CORRECT) {
      const attemptedIds = [...attemptMap.keys()];
      const extraIdQb = this.questionRepo
        .createQueryBuilder('q')
        .select('q.id', 'id')
        .where('q.isActive = true');
      if (attemptedIds.length > 0) {
        extraIdQb.andWhere('q.id NOT IN (:...attemptedIds)', { attemptedIds });
      }
      if (plan.questionIds.length > 0) {
        extraIdQb.andWhere('q.id NOT IN (:...planIds)', {
          planIds: plan.questionIds,
        });
      }
      const extraIdRows = await extraIdQb
        .orderBy(`MD5(q.id::text || :seed)`)
        .setParameter('seed', `${userId}:${planDate}`)
        .limit(MIN_DAILY_PLAN_QUESTIONS)
        .getRawMany<{ id: string }>();

      if (extraIdRows.length > 0) {
        const extraIds = extraIdRows.map((r) => r.id);
        extraQuestions = await this.questionRepo.find({
          where: extraIds.map((id) => ({ id })),
          relations: ['options'],
        });
        const extraOrder = new Map(extraIds.map((id, i) => [id, i]));
        extraQuestions.sort(
          (a, b) => (extraOrder.get(a.id) ?? 0) - (extraOrder.get(b.id) ?? 0),
        );
      }
    }

    const allQuestions = [...questions, ...extraQuestions];

    return {
      planDate,
      organizationId,
      targetQuestions: DAILY_GOAL_CORRECT,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      questionCount: target,
      answeredCount,
      correctCount,
      completionPercent: Math.min(
        100,
        Math.round((correctCount / DAILY_GOAL_CORRECT) * 100),
      ),
      completed: correctCount >= DAILY_GOAL_CORRECT,
      questions: allQuestions.map((q, idx) => ({
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

  /**
   * Oylik progress: har xodim uchun planning bajarilgan kunlari soni.
   * Monthly % = bajarilgan kunlar / oydagi kunlar (masalan 20/31 = 65%).
   * Kun "bajarilgan" hisoblanadi, agar shu Toshkent kunida kamida
   * DAILY_GOAL_CORRECT ta har xil savolga to'g'ri javob berilgan bo'lsa.
   */
  async getMonthlyProgress(orgId: string, month?: string) {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    const { month: m, daysInMonth, from, to } = this.tashkentMonthBounds(month);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    const base = {
      orgId,
      orgName: org.name,
      month: m,
      daysInMonth,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
    };

    if (userIds.length === 0) {
      return {
        ...base,
        totalEmployees: 0,
        averageMonthlyPercent: 0,
        fullCompletedEmployees: 0,
        employees: [],
      };
    }

    // Har user/kun bo'yicha to'g'ri javoblar (distinct savol) — bajarilgan
    // kunlarni sanash uchun.
    const dayRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect(
        `TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`,
        'day',
      )
      .addSelect(
        'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
        'correct',
      )
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', { from, to })
      .groupBy('a.user_id')
      .addGroupBy(`TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`)
      .getRawMany<{ userId: string; day: string; correct: number }>();

    const daysCompletedMap = new Map<string, number>();
    for (const row of dayRows) {
      if (Number(row.correct) >= DAILY_GOAL_CORRECT) {
        daysCompletedMap.set(
          row.userId,
          (daysCompletedMap.get(row.userId) ?? 0) + 1,
        );
      }
    }

    // Umumiy to'g'ri/xato (urinishlar kesimida) va oxirgi faollik.
    const totalRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect('COUNT(*) FILTER (WHERE a.is_correct)::int', 'correctTotal')
      .addSelect('COUNT(*) FILTER (WHERE NOT a.is_correct)::int', 'wrongTotal')
      .addSelect('MAX(a.answered_at)', 'lastActiveAt')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', { from, to })
      .groupBy('a.user_id')
      .getRawMany<{
        userId: string;
        correctTotal: number;
        wrongTotal: number;
        lastActiveAt: Date | null;
      }>();
    const totalsMap = new Map(totalRows.map((r) => [r.userId, r]));

    const employeeResults = employees.map((emp) => {
      const daysCompleted = daysCompletedMap.get(emp.userId) ?? 0;
      const totals = totalsMap.get(emp.userId);
      const lastActive = totals?.lastActiveAt ?? null;
      return {
        userId: emp.userId,
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        email: emp.email,
        daysCompleted,
        monthlyPercent: Math.round((daysCompleted / daysInMonth) * 1000) / 10,
        correctTotal: Number(totals?.correctTotal) || 0,
        wrongTotal: Number(totals?.wrongTotal) || 0,
        lastActiveAt: lastActive ? new Date(lastActive).toISOString() : null,
      };
    });

    employeeResults.sort(
      (a, b) =>
        b.monthlyPercent - a.monthlyPercent ||
        a.fullName.localeCompare(b.fullName),
    );

    const averageMonthlyPercent =
      employeeResults.length > 0
        ? Math.round(
            (employeeResults.reduce((s, e) => s + e.monthlyPercent, 0) /
              employeeResults.length) *
              10,
          ) / 10
        : 0;

    return {
      ...base,
      totalEmployees: employeeResults.length,
      averageMonthlyPercent,
      fullCompletedEmployees: employeeResults.filter(
        (e) => e.daysCompleted >= daysInMonth,
      ).length,
      employees: employeeResults,
    };
  }

  /**
   * Filiallar oylik reytingi: har filial uchun o'rtacha oylik progress %.
   * allowedOrgIds = null — barcha filiallar (SUPERADMIN).
   */
  async getBranchComparison(month?: string, allowedOrgIds: string[] | null = null) {
    const { month: m, daysInMonth, from, to } = this.tashkentMonthBounds(month);

    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name', 'o.isDefault']);
    if (allowedOrgIds?.length) {
      orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
    }
    const orgs = await orgQb.getMany();
    if (orgs.length === 0) {
      return { month: m, daysInMonth, dailyGoalCorrect: DAILY_GOAL_CORRECT, branches: [] };
    }
    const orgIds = orgs.map((o) => o.id);

    // Har filialdagi USER-xodimlar soni.
    const empRows = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select('org.id', 'orgId')
      .addSelect('COUNT(DISTINCT u.id)::int', 'employees')
      .groupBy('org.id')
      .getRawMany<{ orgId: string; employees: number }>();
    const empMap = new Map(empRows.map((r) => [r.orgId, Number(r.employees) || 0]));

    // Har filial bo'yicha jami bajarilgan kunlar (user+kun juftliklari,
    // correct >= goal bo'lganlari).
    const completedRows = (await this.attemptRepo.query(
      `
      SELECT org_id AS "orgId", COUNT(*)::int AS "completedDays"
      FROM (
        SELECT a.organization_id AS org_id,
               a.user_id,
               (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date AS day,
               COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct) AS correct
        FROM user_question_attempts a
        INNER JOIN users u ON u.id = a.user_id AND u.role = 'USER'
        WHERE a.organization_id = ANY($1::uuid[])
          AND a.answered_at >= $2
          AND a.answered_at < $3
        GROUP BY a.organization_id, a.user_id,
                 (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date
      ) t
      WHERE t.correct >= $4
      GROUP BY org_id
      `,
      [orgIds, from, to, DAILY_GOAL_CORRECT],
    )) as Array<{ orgId: string; completedDays: number }>;
    const completedMap = new Map(
      completedRows.map((r) => [r.orgId, Number(r.completedDays) || 0]),
    );

    const branches = orgs
      .map((o) => {
        const employees = empMap.get(o.id) ?? 0;
        const completedDays = completedMap.get(o.id) ?? 0;
        const possibleDays = employees * daysInMonth;
        return {
          orgId: o.id,
          orgName: o.name,
          isDefault: !!o.isDefault,
          totalEmployees: employees,
          completedDays,
          averageMonthlyPercent:
            possibleDays > 0
              ? Math.round((completedDays / possibleDays) * 1000) / 10
              : 0,
        };
      })
      .sort(
        (a, b) =>
          b.averageMonthlyPercent - a.averageMonthlyPercent ||
          a.orgName.localeCompare(b.orgName),
      )
      .map((b, i) => ({ ...b, rank: i + 1 }));

    return { month: m, daysInMonth, dailyGoalCorrect: DAILY_GOAL_CORRECT, branches };
  }
}
