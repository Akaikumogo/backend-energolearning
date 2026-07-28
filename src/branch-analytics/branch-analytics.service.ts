import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { Organization } from '../database/entities/organization.entity';
import { Question } from '../database/entities/question.entity';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  DAILY_GOAL_CORRECT,
  MIN_DAILY_PLAN_QUESTIONS,
} from './daily-plan.service';
import {
  addTashkentDays,
  listTashkentDays,
  parseTashkentRange,
  tashkentDayBounds,
  tashkentMonthBounds,
  tashkentToday,
} from '../common/utils/tashkent-time.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 2026-07-28 dan yangi qoida: faqat DAILY_PLAN. Undan oldin — barcha manbalar. */
const PLAN_RULE_CUTOFF = '2026-07-28';

/** Kunlik reja hisobi (TypeORM). */
const PLAN_ATTEMPT_SQL = `(
  ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date < CAST(:planCutoff AS date))
  OR (a.attempt_source IS NULL OR a.attempt_source = 'DAILY_PLAN')
)`;

/** Raw SQL uchun xuddi shu qoida ($N = YYYY-MM-DD cutoff). */
function planAttemptSqlParam(n: number): string {
  return `(
    ((a.answered_at AT TIME ZONE 'Asia/Tashkent')::date < $${n}::date)
    OR (a.attempt_source IS NULL OR a.attempt_source = 'DAILY_PLAN')
  )`;
}

export type DayStatus = 'active' | 'offline' | 'never';

@Injectable()
export class BranchAnalyticsService {
  constructor(
    private readonly orgService: OrganizationsService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(UserQuestionAttempt)
    private readonly attemptRepo: Repository<UserQuestionAttempt>,
    @InjectRepository(UserSession)
    private readonly sessionRepo: Repository<UserSession>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(NesEmployee)
    private readonly nesEmployeeRepo: Repository<NesEmployee>,
  ) {}

  async resolveOrgScope(
    orgId: string,
    user: { role: Role; organizationIds: string[] },
  ): Promise<string> {
    if (!orgId?.trim()) {
      throw new NotFoundException('orgId majburiy');
    }
    if (orgId === 'all') {
      throw new BadRequestException(
        'Bu endpoint uchun aniq filial UUID kerak (orgId=all emas)',
      );
    }
    if (!UUID_RE.test(orgId)) {
      throw new BadRequestException('orgId UUID formatida bo‘lishi kerak');
    }
    if (user.role === Role.MODERATOR) {
      const scoped = await this.orgService.resolveModeratorScope(
        user.organizationIds,
      );
      // undefined = asosiy filial (barcha). [] yoki ro‘yxat = faqat shu ID lar.
      if (scoped !== undefined && !scoped.includes(orgId)) {
        throw new ForbiddenException('Ruxsat yo`q');
      }
    }
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');
    return orgId;
  }

  /**
   * Ixtiyoriy org filter. `all` / bo‘sh → undefined (barcha ruxsat etilgan filiallar).
   */
  async resolveOptionalOrgScope(
    orgId: string | undefined,
    user: { role: Role; organizationIds: string[] },
  ): Promise<string | undefined> {
    if (!orgId?.trim() || orgId === 'all') {
      if (orgId === 'all' && user.role === Role.MODERATOR) {
        // Moderator "all" deb so‘rasa ham faqat o‘z scope'i (allowedOrgIds) ishlatiladi
        return undefined;
      }
      return undefined;
    }
    return this.resolveOrgScope(orgId, user);
  }

  /** Tashkilotlar sahifasi bilan bir xil: arxiv emas + aktiv Energo ID xodimi bor */
  private applyActiveEnergoOrgFilter<T extends { andWhere: (...args: any[]) => T }>(
    qb: T,
  ): T {
    return qb
      .andWhere('o.archivedAt IS NULL')
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM nes_employees e
          INNER JOIN users eu ON eu.id = e.user_id
          WHERE e.organization_id = o.id
            AND eu.energo_id IS NOT NULL
            AND eu.role = :energoUserRole
        )`,
        { energoUserRole: Role.USER },
      );
  }

  private parseRange(from?: string, to?: string): {
    from: Date;
    to: Date;
    fromStr: string;
    toStr: string;
  } {
    return parseTashkentRange(from, to, 28);
  }

  private listDays(fromStr: string, toStr: string): string[] {
    return listTashkentDays(fromStr, toStr);
  }

  private async getAvailableLevelIdsForUser(userId: string): Promise<string[]> {
    let rows: Array<{ id: string }>;

    try {
      rows = (await this.questionRepo.query(
        `
        WITH ordered_levels AS (
          SELECT
            l.id,
            ROW_NUMBER() OVER (ORDER BY l.order_index ASC, l.created_at ASC) AS rn
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
        ),
        completion AS (
          SELECT
            ulc.level_id,
            MAX(ulc.completion_percent) AS completion_percent
          FROM "user_level_completions" ulc
          WHERE ulc.user_id = $1
          GROUP BY ulc.level_id
        )
        SELECT current_level.id
        FROM ordered_levels current_level
        LEFT JOIN ordered_levels previous_level
          ON previous_level.rn = current_level.rn - 1
        LEFT JOIN completion previous_completion
          ON previous_completion.level_id = previous_level.id
        WHERE current_level.rn = 1
           OR COALESCE(previous_completion.completion_percent, 0) >= 100
        ORDER BY current_level.rn ASC
        `,
        [userId],
      )) as Array<{ id: string }>;
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      rows = (await this.questionRepo.query(
        `
        WITH ordered_levels AS (
          SELECT
            l.id,
            ROW_NUMBER() OVER (ORDER BY l.order_index ASC, l.created_at ASC) AS rn
          FROM "levels" l
          WHERE l.is_active = true
        ),
        completion AS (
          SELECT
            ulc.level_id,
            MAX(ulc.completion_percent) AS completion_percent
          FROM "user_level_completions" ulc
          WHERE ulc.user_id = $1
          GROUP BY ulc.level_id
        )
        SELECT current_level.id
        FROM ordered_levels current_level
        LEFT JOIN ordered_levels previous_level
          ON previous_level.rn = current_level.rn - 1
        LEFT JOIN completion previous_completion
          ON previous_completion.level_id = previous_level.id
        WHERE current_level.rn = 1
           OR COALESCE(previous_completion.completion_percent, 0) >= 100
        ORDER BY current_level.rn ASC
        `,
        [userId],
      )) as Array<{ id: string }>;
    }

    return rows.map((row) => row.id);
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
    const { from: rangeFrom, to: rangeTo, fromStr, toStr } = this.parseRange(from, to);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    if (userIds.length === 0) {
      return {
        orgId,
        range: {
          from: fromStr,
          to: toStr,
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
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .getRawMany();
    const quizTakersCount = quizTakers.length;

    const { from: todayFrom, to: todayTo } = tashkentDayBounds(tashkentToday());

    const activeToday = await this.attemptRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: todayFrom,
        to: todayTo,
      })
      .getRawMany();

    const activeTodayIds = new Set(activeToday.map((r) => r.userId));

    const activeInRange = await this.attemptRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'userId')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
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
    const { from: tFrom, to: tTo } = tashkentDayBounds(tashkentToday());
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
        from: fromStr,
        to: toStr,
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
    const { from: rangeFrom, to: rangeTo, fromStr, toStr } = this.parseRange(from, to);
    const days = this.listDays(fromStr, toStr);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    if (userIds.length === 0) {
      return { orgId, days, employees: [] };
    }

    const attemptRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect("TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)::int', 'count')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .groupBy('a.user_id')
      .addGroupBy("TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')")
      .getRawMany<{ userId: string; day: string; count: number }>();

    const sessionRows = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect("TO_CHAR(s.login_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')", 'day')
      .where('s.user_id IN (:...userIds)', { userIds })
      .andWhere('s.organization_id = :orgId', { orgId })
      .andWhere('s.login_at >= :from AND s.login_at < :to', {
        from: rangeFrom,
        to: rangeTo,
      })
      .groupBy('s.user_id')
      .addGroupBy("TO_CHAR(s.login_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')")
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
    const planDate =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tashkentToday();

    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);
    const { from: dayStart, to: dayEnd } = tashkentDayBounds(planDate);

    // Reja: bugundan oldingi kunlar — barcha to'g'ri (tarix saqlanadi);
    // bugun va keyin — faqat DAILY_PLAN (LESSON planga kirmaydi).
    let userResults: Array<{
      userId: string;
      fullName: string;
      answeredCount: number;
      correctCount: number;
      planCorrectCount: number;
      extraCorrectCount: number;
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
        .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
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
        const rawCorrect = Number(stats?.correctCount) || 0;
        const planCorrectCount = Math.min(rawCorrect, DAILY_GOAL_CORRECT);
        const extraCorrectCount = Math.max(0, rawCorrect - DAILY_GOAL_CORRECT);
        const completionPercent = Math.min(
          100,
          Math.round((planCorrectCount / DAILY_GOAL_CORRECT) * 100),
        );
        return {
          userId: emp.userId,
          fullName: `${emp.lastName} ${emp.firstName}`.trim(),
          answeredCount,
          correctCount: planCorrectCount,
          planCorrectCount,
          extraCorrectCount,
          completed: rawCorrect >= DAILY_GOAL_CORRECT,
          completionPercent,
        };
      });
    }

    const completedCount = userResults.filter((u) => u.completed).length;

    return {
      orgId,
      planDate,
      // Yangi modelda belgilangan savollar ro'yxati yo'q — savollar har bir
      // xodimga lavozimi bo'yicha bittalab random beriladi.
      questionCount: 0,
      targetQuestions: MIN_DAILY_PLAN_QUESTIONS,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      completedEmployees: completedCount,
      totalEmployees: employees.length,
      questions: [] as Array<{
        id: string;
        orderIndex: number;
        prompt: string;
        levelTitle: string;
        theoryTitle: string;
      }>,
      userResults,
    };
  }

  /** Bugungi (Toshkent) plan statistikasi: sariq/yashil/qizil chiplar uchun. */
  private async getDayPlanStats(userId: string, organizationId: string) {
    const planDate = tashkentToday();
    const { from: dayStart, to: dayEnd } = tashkentDayBounds(planDate);

    const row = await this.attemptRepo
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.question_id)::int', 'answered')
      .addSelect(
        'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
        'correct',
      )
      .where('a.user_id = :userId', { userId })
      .andWhere('a.organization_id = :organizationId', { organizationId })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: dayStart,
        to: dayEnd,
      })
      .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
      .getRawOne<{ answered: number; correct: number }>();

    const answeredCount = Number(row?.answered) || 0;
    const rawCorrectCount = Number(row?.correct) || 0;
    const correctCount = Math.min(rawCorrectCount, DAILY_GOAL_CORRECT);
    const extraCorrectCount = Math.max(0, rawCorrectCount - DAILY_GOAL_CORRECT);
    // Qizil chip: urinilgan, lekin (hali) to'g'ri topilmagan savollar.
    const wrongCount = Math.max(0, answeredCount - rawCorrectCount);

    return {
      planDate,
      answeredCount,
      correctCount,
      rawCorrectCount,
      extraCorrectCount,
      wrongCount,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      completionPercent: Math.min(
        100,
        Math.round((correctCount / DAILY_GOAL_CORRECT) * 100),
      ),
      completed: rawCorrectCount >= DAILY_GOAL_CORRECT,
    };
  }

  /**
   * Kunlik plan sahifasi uchun summary. Yangi modelda belgilangan savollar
   * ro'yxati yo'q — savollar /mobile/daily-plan/next-question orqali
   * bittalab olinadi. `questions: []` eski app buildlari uchun saqlangan.
   */
  async getMobileDailyPlan(userId: string, organizationId: string) {
    const stats = await this.getDayPlanStats(userId, organizationId);

    return {
      planDate: stats.planDate,
      organizationId,
      targetQuestions: DAILY_GOAL_CORRECT,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      questionCount: 0,
      answeredCount: stats.answeredCount,
      correctCount: stats.correctCount,
      rawCorrectCount: stats.rawCorrectCount,
      extraCorrectCount: stats.extraCorrectCount,
      wrongCount: stats.wrongCount,
      completionPercent: stats.completionPercent,
      completed: stats.completed,
      questions: [] as unknown[],
    };
  }

  /**
   * Kunlik plan uchun keyingi savol:
   * - pool: userga ochiq modullar ichidagi faol savollar; modul lavozimga
   *   bog'lanmagan bo'lsa HAMMA xodimga, bog'langan bo'lsa shu lavozimlarga;
   * - oxirgi 24 soat (rolling) ichida kunlik reja (DAILY_PLAN) sifatida
   *   ishlangan savol takrorlanmaydi; dars (LESSON) urinishi to'smaydi —
   *   shunda xodim kunlik rejadan XP olishi mumkin;
   * - random tanlanadi;
   * - maqsad (10 ta to'g'ri) bajarilgandan keyin ham qo'shimcha savollar
   *   beriladi; pool tugagan bo'lsa exhausted=true qaytadi.
   */
  async getNextDailyQuizQuestion(userId: string, organizationId: string) {
    const progress = await this.getDayPlanStats(userId, organizationId);

    const availableLevelIds = await this.getAvailableLevelIdsForUser(userId);
    if (availableLevelIds.length === 0) {
      return { done: false, exhausted: true, question: null, progress };
    }

    const idRows = (await this.questionRepo.query(
      `
      SELECT q.id
      FROM "questions" q
      WHERE q.is_active = true
        AND q.level_id = ANY($2::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM "user_question_attempts" a
          WHERE a.user_id = $1
            AND a.question_id = q.id
            AND a.answered_at > NOW() - INTERVAL '24 hours'
            AND (a.attempt_source IS NULL OR a.attempt_source = 'DAILY_PLAN')
        )
      ORDER BY RANDOM()
      LIMIT 1
      `,
      [userId, availableLevelIds],
    )) as Array<{ id: string }>;

    if (idRows.length === 0) {
      return { done: false, exhausted: true, question: null, progress };
    }

    const question = await this.questionRepo.findOne({
      where: { id: idRows[0].id },
      relations: ['options'],
    });
    if (!question) {
      return { done: false, exhausted: true, question: null, progress };
    }

    return {
      done: false,
      exhausted: false,
      progress,
      question: {
        id: question.id,
        prompt: question.prompt,
        type: question.type,
        options: (question.options ?? [])
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => ({
            id: o.id,
            optionText: o.optionText,
            orderIndex: o.orderIndex,
            matchText: o.matchText ?? null,
          })),
      },
    };
  }

  /**
   * Moderator auditi: xodimning barcha javoblari — qaysi savolga qaysi
   * variantni belgilagani, to'g'ri/xato, vaqti. Sana oralig'i bilan
   * (o'tgan kunlarni ham ko'rish mumkin).
   */
  async getEmployeeAttempts(
    orgId: string,
    userId: string,
    from?: string,
    to?: string,
    page = 1,
    limit = 50,
  ) {
    const user = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('u.id = :userId', { userId })
      .andWhere('org.id = :orgId', { orgId })
      .getOne();
    if (!user) {
      throw new NotFoundException('Xodim bu filialda topilmadi');
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const fromStr = from && dateRe.test(from) ? from : tashkentToday();
    const toStr = to && dateRe.test(to) ? to : fromStr;
    const rangeFrom = tashkentDayBounds(fromStr).from;
    const rangeTo = tashkentDayBounds(toStr).to;

    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);

    const baseQb = this.attemptRepo
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId })
      .andWhere('a.organization_id = :orgId', { orgId })
      .andWhere('a.answered_at >= :rangeFrom AND a.answered_at < :rangeTo', {
        rangeFrom,
        rangeTo,
      });

    const totals = await baseQb
      .clone()
      .select('COUNT(*)::int', 'total')
      .addSelect('COUNT(*) FILTER (WHERE a.is_correct)::int', 'correct')
      .getRawOne<{ total: number; correct: number }>();
    const total = Number(totals?.total) || 0;
    const correctTotal = Number(totals?.correct) || 0;

    // MATCHING savollarda hamma variant is_correct=true bo'ladi — oddiy JOIN
    // qatorlarni ko'paytiradi, shu sababli to'g'ri javob scalar subquery bilan.
    const rows = await baseQb
      .clone()
      .innerJoin('a.question', 'q')
      .leftJoin('q.level', 'l')
      .leftJoin('q.theory', 't')
      .leftJoin('a.selectedOption', 'sel')
      .select('a.id', 'id')
      .addSelect('a.question_id', 'questionId')
      .addSelect('q.prompt', 'prompt')
      .addSelect('q.type', 'type')
      .addSelect('l.title', 'levelTitle')
      .addSelect('t.title', 'theoryTitle')
      .addSelect('sel.option_text', 'selectedOptionText')
      .addSelect(
        `(
          SELECT o.option_text FROM "question_options" o
          WHERE o.question_id = a.question_id AND o.is_correct = true
          ORDER BY o.order_index ASC
          LIMIT 1
        )`,
        'correctOptionText',
      )
      .addSelect('a.is_correct', 'isCorrect')
      .addSelect('a.answered_at', 'answeredAt')
      .orderBy('a.answered_at', 'DESC')
      .offset((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .getRawMany<{
        id: string;
        questionId: string;
        prompt: string;
        type: string;
        levelTitle: string | null;
        theoryTitle: string | null;
        selectedOptionText: string | null;
        correctOptionText: string | null;
        isCorrect: boolean;
        answeredAt: Date;
      }>();

    return {
      orgId,
      userId,
      fullName: `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim(),
      range: { from: fromStr, to: toStr },
      total,
      correctTotal,
      wrongTotal: total - correctTotal,
      page: safePage,
      limit: safeLimit,
      items: rows.map((r) => ({
        id: r.id,
        questionId: r.questionId,
        prompt: r.prompt,
        type: r.type,
        levelTitle: r.levelTitle ?? '',
        theoryTitle: r.theoryTitle ?? '',
        selectedOptionText: r.selectedOptionText ?? null,
        correctOptionText: r.correctOptionText ?? null,
        isCorrect: r.isCorrect,
        answeredAt: new Date(r.answeredAt).toISOString(),
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

    const { month: m, daysInMonth, from, to } = tashkentMonthBounds(month);
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
      .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
      .groupBy('a.user_id')
      .addGroupBy(`TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`)
      .getRawMany<{ userId: string; day: string; correct: number }>();

    const daysCompletedMap = new Map<string, number>();
    const extraTotalMap = new Map<string, number>();
    for (const row of dayRows) {
      const rawCorrect = Number(row.correct) || 0;
      if (rawCorrect >= DAILY_GOAL_CORRECT) {
        daysCompletedMap.set(
          row.userId,
          (daysCompletedMap.get(row.userId) ?? 0) + 1,
        );
      }
      const extra = Math.max(0, rawCorrect - DAILY_GOAL_CORRECT);
      if (extra > 0) {
        extraTotalMap.set(
          row.userId,
          (extraTotalMap.get(row.userId) ?? 0) + extra,
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
        extraCorrectTotal: extraTotalMap.get(emp.userId) ?? 0,
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
   * Oylik reja matrisi: har xodim × oy kunlari (necha/10).
   * orgId bo‘lmasa — ruxsat etilgan barcha filiallar (har qatorda orgName).
   */
  async getMonthlyPlanMatrix(
    orgId: string | undefined,
    month?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const scope = this.narrowOrgScope(allowedOrgIds, orgId);
    const { month: m, daysInMonth, from, to } = tashkentMonthBounds(month);
    const monthStart = `${m}-01`;
    const monthEnd = addTashkentDays(monthStart, daysInMonth - 1);
    const days = listTashkentDays(monthStart, monthEnd);

    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name']);
    if (scope?.length) {
      orgQb.where('o.id IN (:...ids)', { ids: scope });
    } else if (orgId?.trim() && orgId !== 'all') {
      orgQb.where('o.id = :orgId', { orgId: orgId.trim() });
    }
    if (!orgId?.trim() || orgId === 'all') {
      this.applyActiveEnergoOrgFilter(orgQb);
    }
    const orgs = await orgQb.orderBy('o.name', 'ASC').getMany();

    const base = {
      orgId: orgs.length === 1 ? orgs[0].id : '',
      orgName:
        orgs.length === 1
          ? orgs[0].name
          : orgs.length === 0
            ? '—'
            : 'Barcha filiallar',
      month: m,
      daysInMonth,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      days,
    };

    if (orgs.length === 0) {
      return {
        ...base,
        totalEmployees: 0,
        averageMonthlyPercent: 0,
        fullCompletedEmployees: 0,
        employees: [] as Array<{
          userId: string;
          orgId: string;
          orgName: string;
          fullName: string;
          email: string;
          daysCompleted: number;
          monthlyPercent: number;
          extraCorrectTotal: number;
          attemptsTotal: number;
          wrongTotal: number;
          dayResults: Array<{
            date: string;
            day: number;
            rawCorrect: number;
            planCorrect: number;
            extraCorrect: number;
            attempts: number;
            wrong: number;
            completed: boolean;
            label: string;
          }>;
        }>,
      };
    }

    const orgIds = orgs.map((o) => o.id);
    const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

    const employees = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select([
        'u.id AS "userId"',
        'org.id AS "orgId"',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.email AS "email"',
      ])
      .orderBy('org.name', 'ASC')
      .addOrderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .getRawMany<{
        userId: string;
        orgId: string;
        firstName: string;
        lastName: string;
        email: string;
      }>();

    const userIds = [...new Set(employees.map((e) => e.userId))];
    if (userIds.length === 0) {
      return {
        ...base,
        totalEmployees: 0,
        averageMonthlyPercent: 0,
        fullCompletedEmployees: 0,
        employees: [],
      };
    }

    const dayRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect('a.organization_id', 'orgId')
      .addSelect(
        `TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`,
        'day',
      )
      .addSelect(
        'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
        'correct',
      )
      .addSelect('COUNT(*)::int', 'attempts')
      .addSelect('COUNT(*) FILTER (WHERE NOT a.is_correct)::int', 'wrong')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id IN (:...orgIds)', { orgIds })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', { from, to })
      .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
      .groupBy('a.user_id')
      .addGroupBy('a.organization_id')
      .addGroupBy(
        `TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`,
      )
      .getRawMany<{
        userId: string;
        orgId: string;
        day: string;
        correct: number;
        attempts: number;
        wrong: number;
      }>();

    type DayStat = { correct: number; attempts: number; wrong: number };
    const byUserOrgDay = new Map<string, Map<string, DayStat>>();
    for (const row of dayRows) {
      const key = `${row.orgId}:${row.userId}`;
      if (!byUserOrgDay.has(key)) byUserOrgDay.set(key, new Map());
      byUserOrgDay.get(key)!.set(row.day, {
        correct: Number(row.correct) || 0,
        attempts: Number(row.attempts) || 0,
        wrong: Number(row.wrong) || 0,
      });
    }

    const employeeResults = employees.map((emp) => {
      const dayMap =
        byUserOrgDay.get(`${emp.orgId}:${emp.userId}`) ??
        new Map<string, DayStat>();
      let daysCompleted = 0;
      let extraCorrectTotal = 0;
      let attemptsTotal = 0;
      let wrongTotal = 0;
      const dayCells = days.map((date) => {
        const stat = dayMap.get(date);
        const rawCorrect = stat?.correct ?? 0;
        const attempts = stat?.attempts ?? 0;
        const wrong = stat?.wrong ?? 0;
        const planCorrect = Math.min(rawCorrect, DAILY_GOAL_CORRECT);
        const extraCorrect = Math.max(0, rawCorrect - DAILY_GOAL_CORRECT);
        const completed = rawCorrect >= DAILY_GOAL_CORRECT;
        if (completed) daysCompleted += 1;
        extraCorrectTotal += extraCorrect;
        attemptsTotal += attempts;
        wrongTotal += wrong;
        return {
          date,
          day: Number(date.slice(8, 10)),
          rawCorrect,
          planCorrect,
          extraCorrect,
          attempts,
          wrong,
          completed,
          label: `${planCorrect}/${DAILY_GOAL_CORRECT}`,
        };
      });

      const monthlyPercent =
        Math.round((daysCompleted / daysInMonth) * 1000) / 10;

      return {
        userId: emp.userId,
        orgId: emp.orgId,
        orgName: orgNameById.get(emp.orgId) ?? '',
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        email: emp.email,
        daysCompleted,
        monthlyPercent,
        extraCorrectTotal,
        attemptsTotal,
        wrongTotal,
        dayResults: dayCells,
      };
    });

    employeeResults.sort(
      (a, b) =>
        b.monthlyPercent - a.monthlyPercent ||
        a.orgName.localeCompare(b.orgName) ||
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
   * Yillik reja matrisi: har xodim × oy (% va bajarilgan kun / oy kunlari).
   */
  async getYearlyPlanMatrix(
    orgId: string | undefined,
    year?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const scope = this.narrowOrgScope(allowedOrgIds, orgId);
    const y = /^\d{4}$/.test(year?.trim() ?? '')
      ? (year as string).trim()
      : tashkentToday().slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) =>
      `${y}-${String(i + 1).padStart(2, '0')}`,
    );
    const yearFrom = new Date(`${y}-01-01T00:00:00.000+05:00`);
    const yearTo = new Date(`${Number(y) + 1}-01-01T00:00:00.000+05:00`);
    const daysInMonthByKey = new Map(
      months.map((m) => [m, tashkentMonthBounds(m).daysInMonth]),
    );

    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name']);
    if (scope?.length) {
      orgQb.where('o.id IN (:...ids)', { ids: scope });
    } else if (orgId?.trim() && orgId !== 'all') {
      orgQb.where('o.id = :orgId', { orgId: orgId.trim() });
    }
    if (!orgId?.trim() || orgId === 'all') {
      this.applyActiveEnergoOrgFilter(orgQb);
    }
    const orgs = await orgQb.orderBy('o.name', 'ASC').getMany();

    const base = {
      orgId: orgs.length === 1 ? orgs[0].id : '',
      orgName:
        orgs.length === 1
          ? orgs[0].name
          : orgs.length === 0
            ? '—'
            : 'Barcha filiallar',
      year: y,
      months,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
    };

    if (orgs.length === 0) {
      return {
        ...base,
        totalEmployees: 0,
        averageYearlyPercent: 0,
        employees: [],
      };
    }

    const orgIds = orgs.map((o) => o.id);
    const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));

    const employees = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select([
        'u.id AS "userId"',
        'org.id AS "orgId"',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
        'u.email AS "email"',
      ])
      .orderBy('org.name', 'ASC')
      .addOrderBy('u.last_name', 'ASC')
      .addOrderBy('u.first_name', 'ASC')
      .getRawMany<{
        userId: string;
        orgId: string;
        firstName: string;
        lastName: string;
        email: string;
      }>();

    const userIds = [...new Set(employees.map((e) => e.userId))];
    if (userIds.length === 0) {
      return {
        ...base,
        totalEmployees: 0,
        averageYearlyPercent: 0,
        employees: [],
      };
    }

    const dayRows = await this.attemptRepo
      .createQueryBuilder('a')
      .select('a.user_id', 'userId')
      .addSelect('a.organization_id', 'orgId')
      .addSelect(
        `TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`,
        'day',
      )
      .addSelect(
        'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
        'correct',
      )
      .addSelect('COUNT(*)::int', 'attempts')
      .addSelect('COUNT(*) FILTER (WHERE NOT a.is_correct)::int', 'wrong')
      .where('a.user_id IN (:...userIds)', { userIds })
      .andWhere('a.organization_id IN (:...orgIds)', { orgIds })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: yearFrom,
        to: yearTo,
      })
      .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
      .groupBy('a.user_id')
      .addGroupBy('a.organization_id')
      .addGroupBy(
        `TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')`,
      )
      .getRawMany<{
        userId: string;
        orgId: string;
        day: string;
        correct: number;
        attempts: number;
        wrong: number;
      }>();

    type DayAgg = { correct: number; attempts: number; wrong: number };
    const byUserOrgDay = new Map<string, Map<string, DayAgg>>();
    for (const row of dayRows) {
      const key = `${row.orgId}:${row.userId}`;
      if (!byUserOrgDay.has(key)) byUserOrgDay.set(key, new Map());
      byUserOrgDay.get(key)!.set(row.day, {
        correct: Number(row.correct) || 0,
        attempts: Number(row.attempts) || 0,
        wrong: Number(row.wrong) || 0,
      });
    }

    const employeeResults = employees.map((emp) => {
      const dayMap =
        byUserOrgDay.get(`${emp.orgId}:${emp.userId}`) ??
        new Map<string, DayAgg>();
      let attemptsTotal = 0;
      let wrongTotal = 0;
      let extraCorrectTotal = 0;
      let daysCompletedYear = 0;
      let daysInYear = 0;

      const monthResults = months.map((monthKey) => {
        const daysInMonth = daysInMonthByKey.get(monthKey) ?? 30;
        daysInYear += daysInMonth;
        const monthStart = `${monthKey}-01`;
        const monthEnd = addTashkentDays(monthStart, daysInMonth - 1);
        const days = listTashkentDays(monthStart, monthEnd);
        let daysCompleted = 0;
        let monthAttempts = 0;
        let monthWrong = 0;
        let monthExtra = 0;
        for (const date of days) {
          const stat = dayMap.get(date);
          if (!stat) continue;
          const rawCorrect = stat.correct;
          monthAttempts += stat.attempts;
          monthWrong += stat.wrong;
          monthExtra += Math.max(0, rawCorrect - DAILY_GOAL_CORRECT);
          if (rawCorrect >= DAILY_GOAL_CORRECT) daysCompleted += 1;
        }
        attemptsTotal += monthAttempts;
        wrongTotal += monthWrong;
        extraCorrectTotal += monthExtra;
        daysCompletedYear += daysCompleted;
        const percent =
          Math.round((daysCompleted / daysInMonth) * 1000) / 10;
        return {
          month: monthKey,
          daysInMonth,
          daysCompleted,
          percent,
          attempts: monthAttempts,
          wrong: monthWrong,
          extraCorrect: monthExtra,
          label: `${daysCompleted}/${daysInMonth}`,
          percentLabel: `${percent}%`,
        };
      });

      const yearlyPercent =
        daysInYear > 0
          ? Math.round((daysCompletedYear / daysInYear) * 1000) / 10
          : 0;

      return {
        userId: emp.userId,
        orgId: emp.orgId,
        orgName: orgNameById.get(emp.orgId) ?? '',
        fullName: `${emp.lastName} ${emp.firstName}`.trim(),
        email: emp.email,
        daysCompleted: daysCompletedYear,
        daysInYear,
        yearlyPercent,
        extraCorrectTotal,
        attemptsTotal,
        wrongTotal,
        monthResults,
      };
    });

    employeeResults.sort(
      (a, b) =>
        b.yearlyPercent - a.yearlyPercent ||
        a.orgName.localeCompare(b.orgName) ||
        a.fullName.localeCompare(b.fullName),
    );

    const averageYearlyPercent =
      employeeResults.length > 0
        ? Math.round(
            (employeeResults.reduce((s, e) => s + e.yearlyPercent, 0) /
              employeeResults.length) *
              10,
          ) / 10
        : 0;

    return {
      ...base,
      totalEmployees: employeeResults.length,
      averageYearlyPercent,
      employees: employeeResults,
    };
  }

  /**
   * Filiallar oylik reytingi: har filial uchun o'rtacha oylik progress %.
   * allowedOrgIds = null — barcha filiallar (SUPERADMIN).
   */
  async getBranchComparison(month?: string, allowedOrgIds: string[] | null = null) {
    const { month: m, daysInMonth, from, to } = tashkentMonthBounds(month);

    if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      return { month: m, daysInMonth, dailyGoalCorrect: DAILY_GOAL_CORRECT, branches: [] };
    }

    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name', 'o.isDefault']);
    if (allowedOrgIds !== null) {
      orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
    }
    this.applyActiveEnergoOrgFilter(orgQb);
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
    const planCutoff = PLAN_RULE_CUTOFF;
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
          AND ${planAttemptSqlParam(5)}
        GROUP BY a.organization_id, a.user_id,
                 (a.answered_at AT TIME ZONE 'Asia/Tashkent')::date
      ) t
      WHERE t.correct >= $4
      GROUP BY org_id
      `,
      [orgIds, from, to, DAILY_GOAL_CORRECT, planCutoff],
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

  private parsePlanDate(date?: string): string {
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tashkentToday();
  }

  private statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 90) return 'green';
    if (p >= 70) return 'yellow';
    return 'red';
  }

  /** Kunlik reja statistikasi: userId -> planCorrect / extraCorrect / rawCorrect. */
  private async getUserDayStatsMap(
    orgIds: string[],
    planDate: string,
    userIds?: string[],
  ): Promise<
    Map<string, { planCorrect: number; extraCorrect: number; rawCorrect: number }>
  > {
    if (orgIds.length === 0) return new Map();
    const { from: dayStart, to: dayEnd } = tashkentDayBounds(planDate);

    const qb = this.attemptRepo
      .createQueryBuilder('a')
      .innerJoin(User, 'u', 'u.id = a.user_id')
      .select('a.user_id', 'userId')
      .addSelect(
        'COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct)::int',
        'rawCorrect',
      )
      .where('a.organization_id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .andWhere('a.answered_at >= :from AND a.answered_at < :to', {
        from: dayStart,
        to: dayEnd,
      })
      .andWhere(PLAN_ATTEMPT_SQL, { planCutoff: PLAN_RULE_CUTOFF })
      .groupBy('a.user_id');

    if (userIds?.length) {
      qb.andWhere('a.user_id IN (:...userIds)', { userIds });
    }

    const rows = await qb.getRawMany<{ userId: string; rawCorrect: number }>();
    return new Map(
      rows.map((r) => {
        const rawCorrect = Number(r.rawCorrect) || 0;
        const planCorrect = Math.min(rawCorrect, DAILY_GOAL_CORRECT);
        const extraCorrect = Math.max(0, rawCorrect - DAILY_GOAL_CORRECT);
        return [r.userId, { planCorrect, extraCorrect, rawCorrect }];
      }),
    );
  }

  /** Kunlik reja statistikasi: userId -> to'g'ri javoblar (max DAILY_GOAL_CORRECT). */
  private async getUserCorrectMap(
    orgIds: string[],
    planDate: string,
    userIds?: string[],
  ): Promise<Map<string, number>> {
    const statsMap = await this.getUserDayStatsMap(orgIds, planDate, userIds);
    return new Map(
      [...statsMap.entries()].map(([uid, s]) => [uid, s.planCorrect]),
    );
  }

  private async countEmployeesByOrg(orgIds: string[]): Promise<Map<string, number>> {
    if (!orgIds.length) return new Map();
    const rows = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select('org.id', 'orgId')
      .addSelect('COUNT(DISTINCT u.id)::int', 'cnt')
      .groupBy('org.id')
      .getRawMany<{ orgId: string; cnt: number }>();
    return new Map(rows.map((r) => [r.orgId, Number(r.cnt) || 0]));
  }

  /** Rahbar uchun bosh dashboard — barcha filiallar bo'yicha kunlik reja. */
  async getExecutiveDashboard(
    date?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const planDate = this.parsePlanDate(date);
    if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      return {
        planDate,
        dailyGoalCorrect: DAILY_GOAL_CORRECT,
        totalPlan: 0,
        completedTotal: 0,
        extraCorrectTotal: 0,
        remaining: 0,
        completionPercent: 0,
        totalEmployees: 0,
        activeEmployees: 0,
        completedEmployees: 0,
        branchCount: 0,
      };
    }
    const orgQb = this.orgRepo.createQueryBuilder('o').select(['o.id', 'o.name']);
    if (allowedOrgIds !== null) {
      orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
    }
    this.applyActiveEnergoOrgFilter(orgQb);
    const orgs = await orgQb.getMany();
    const orgIds = orgs.map((o) => o.id);

    const empMap = await this.countEmployeesByOrg(orgIds);
    const totalEmployees = [...empMap.values()].reduce((s, n) => s + n, 0);
    const totalPlan = totalEmployees * DAILY_GOAL_CORRECT;

    const correctMap = await this.getUserCorrectMap(orgIds, planDate);
    const dayStatsMap = await this.getUserDayStatsMap(orgIds, planDate);
    let completedTotal = 0;
    let extraCorrectTotal = 0;
    let activeEmployees = 0;
    let completedEmployees = 0;
    for (const [, correct] of correctMap) {
      if (correct > 0) activeEmployees++;
      completedTotal += correct;
      if (correct >= DAILY_GOAL_CORRECT) completedEmployees++;
    }
    for (const [, stats] of dayStatsMap) {
      extraCorrectTotal += stats.extraCorrect;
    }

    const completionPercent =
      totalPlan > 0 ? Math.round((completedTotal / totalPlan) * 1000) / 10 : 0;

    return {
      planDate,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      totalPlan,
      completedTotal,
      extraCorrectTotal,
      remaining: Math.max(0, totalPlan - completedTotal),
      completionPercent,
      totalEmployees,
      activeEmployees,
      completedEmployees,
      branchCount: orgs.length,
    };
  }

  /** Kunlik filiallar reytingi (reja / bajarildi / %). */
  async getBranchRanking(
    date?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const planDate = this.parsePlanDate(date);
    if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      return { planDate, dailyGoalCorrect: DAILY_GOAL_CORRECT, branches: [] };
    }
    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name', 'o.isDefault']);
    if (allowedOrgIds !== null) {
      orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
    }
    this.applyActiveEnergoOrgFilter(orgQb);
    const orgs = await orgQb.orderBy('o.name', 'ASC').getMany();
    const orgIds = orgs.map((o) => o.id);

    const empMap = await this.countEmployeesByOrg(orgIds);
    const correctMap = await this.getUserCorrectMap(orgIds, planDate);
    const dayStatsMap = await this.getUserDayStatsMap(orgIds, planDate);

    const employeesByOrg = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select('org.id', 'orgId')
      .addSelect('u.id', 'userId')
      .getRawMany<{ orgId: string; userId: string }>();

    const orgUserMap = new Map<string, string[]>();
    for (const row of employeesByOrg) {
      if (!orgUserMap.has(row.orgId)) orgUserMap.set(row.orgId, []);
      orgUserMap.get(row.orgId)!.push(row.userId);
    }

    const branches = orgs
      .map((o) => {
        const employees = empMap.get(o.id) ?? 0;
        const plan = employees * DAILY_GOAL_CORRECT;
        const userIds = orgUserMap.get(o.id) ?? [];
        let completed = 0;
        let extraCorrect = 0;
        let completedEmployees = 0;
        for (const uid of userIds) {
          const c = correctMap.get(uid) ?? 0;
          completed += c;
          extraCorrect += dayStatsMap.get(uid)?.extraCorrect ?? 0;
          if (c >= DAILY_GOAL_CORRECT) completedEmployees++;
        }
        const percent = plan > 0 ? Math.round((completed / plan) * 1000) / 10 : 0;
        return {
          orgId: o.id,
          orgName: o.name,
          isDefault: !!o.isDefault,
          totalEmployees: employees,
          plan,
          completed,
          extraCorrect,
          percent,
          completedEmployees,
          status: this.statusFromPercent(percent),
        };
      })
      .sort((a, b) => b.percent - a.percent || a.orgName.localeCompare(b.orgName))
      .map((b, i) => ({ ...b, rank: i + 1 }));

    return { planDate, dailyGoalCorrect: DAILY_GOAL_CORRECT, branches };
  }

  /** Filial ichidagi bo'limlar (NES division) bo'yicha kunlik reja. */
  async getDivisionSummary(orgId: string, date?: string) {
    const planDate = this.parsePlanDate(date);
    const employees = await this.getEmployeeIds(orgId);
    const userIds = employees.map((e) => e.userId);

    const nesRows = userIds.length
      ? await this.nesEmployeeRepo
          .createQueryBuilder('n')
          .where('n.organization_id = :orgId', { orgId })
          .andWhere('n.user_id IN (:...userIds)', { userIds })
          .select(['n.user_id AS "userId"', 'n.division AS division'])
          .getRawMany<{ userId: string; division: string }>()
      : [];

    const divisionByUser = new Map<string, string>();
    for (const r of nesRows) {
      const div = (r.division || '').trim() || "Bo'lim belgilanmagan";
      divisionByUser.set(r.userId, div);
    }

    const correctMap = await this.getUserCorrectMap([orgId], planDate, userIds);

    const divStats = new Map<
      string,
      { employees: number; plan: number; completed: number; completedEmployees: number }
    >();

    for (const emp of employees) {
      const div = divisionByUser.get(emp.userId) ?? "Bo'lim belgilanmagan";
      if (!divStats.has(div)) {
        divStats.set(div, { employees: 0, plan: 0, completed: 0, completedEmployees: 0 });
      }
      const s = divStats.get(div)!;
      s.employees++;
      s.plan += DAILY_GOAL_CORRECT;
      const c = correctMap.get(emp.userId) ?? 0;
      s.completed += c;
      if (c >= DAILY_GOAL_CORRECT) s.completedEmployees++;
    }

    const divisions = [...divStats.entries()]
      .map(([division, s]) => {
        const percent = s.plan > 0 ? Math.round((s.completed / s.plan) * 1000) / 10 : 0;
        return {
          division,
          totalEmployees: s.employees,
          plan: s.plan,
          completed: s.completed,
          percent,
          completedEmployees: s.completedEmployees,
          status: this.statusFromPercent(percent),
        };
      })
      .sort((a, b) => b.percent - a.percent || a.division.localeCompare(b.division));

    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    let branchTotal = { plan: 0, completed: 0, employees: employees.length };
    for (const d of divisions) {
      branchTotal.plan += d.plan;
      branchTotal.completed += d.completed;
    }
    const branchPercent =
      branchTotal.plan > 0
        ? Math.round((branchTotal.completed / branchTotal.plan) * 1000) / 10
        : 0;

    return {
      orgId,
      orgName: org?.name ?? '',
      planDate,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      totalEmployees: employees.length,
      plan: branchTotal.plan,
      completed: branchTotal.completed,
      percent: branchPercent,
      divisions,
    };
  }

  /** Xodimlar reytingi (filial yoki bo'lim bo'yicha). */
  async getEmployeeRanking(orgId: string, date?: string, division?: string) {
    const planDate = this.parsePlanDate(date);
    let employees = await this.getEmployeeIds(orgId);

    if (division) {
      const decoded = decodeURIComponent(division);
      const nesRows = await this.nesEmployeeRepo
        .createQueryBuilder('n')
        .where('n.organization_id = :orgId', { orgId })
        .select(['n.user_id AS "userId"', 'n.division AS division'])
        .getRawMany<{ userId: string; division: string }>();
      const divUsers = new Set(
        nesRows
          .filter((r) => {
            const d = (r.division || '').trim() || "Bo'lim belgilanmagan";
            return d === decoded;
          })
          .map((r) => r.userId),
      );
      employees = employees.filter((e) => divUsers.has(e.userId));
    }

    const userIds = employees.map((e) => e.userId);
    const correctMap = await this.getUserCorrectMap([orgId], planDate, userIds);
    const dayStatsMap = await this.getUserDayStatsMap([orgId], planDate, userIds);

    const employees_ranked = employees
      .map((emp) => {
        const correct = correctMap.get(emp.userId) ?? 0;
        const extraCorrect = dayStatsMap.get(emp.userId)?.extraCorrect ?? 0;
        const percent = Math.min(
          100,
          Math.round((correct / DAILY_GOAL_CORRECT) * 1000) / 10,
        );
        return {
          userId: emp.userId,
          fullName: `${emp.lastName} ${emp.firstName}`.trim(),
          correct,
          planCorrect: correct,
          extraCorrect,
          goal: DAILY_GOAL_CORRECT,
          percent,
          completed: correct >= DAILY_GOAL_CORRECT,
          status: this.statusFromPercent(percent),
        };
      })
      .sort((a, b) => b.percent - a.percent || a.fullName.localeCompare(b.fullName))
      .map((e, i) => ({ ...e, rank: i + 1 }));

    return {
      orgId,
      planDate,
      division: division ? decodeURIComponent(division) : null,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      employees: employees_ranked,
    };
  }

  /** Kun davomida bajarilish (soat bo'yicha kumulyativ). */
  async getHourlyProgress(
    date?: string,
    orgId?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const planDate = this.parsePlanDate(date);
    const { from: dayStart, to: dayEnd } = tashkentDayBounds(planDate);

    if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      return { planDate, orgId: orgId ?? null, points: [], maxCompleted: 0 };
    }

    const params: unknown[] = [
      dayStart,
      dayEnd,
      DAILY_GOAL_CORRECT,
      PLAN_RULE_CUTOFF,
    ];
    let orgFilter = '';
    if (orgId) {
      if (allowedOrgIds && !allowedOrgIds.includes(orgId)) {
        throw new ForbiddenException('Bu filialga ruxsat yo‘q');
      }
      orgFilter = 'AND a.organization_id = $5';
      params.push(orgId);
    } else if (allowedOrgIds?.length) {
      orgFilter = `AND a.organization_id = ANY($5::uuid[])`;
      params.push(allowedOrgIds);
    }

    const rows = (await this.attemptRepo.query(
      `
      WITH tz_attempts AS (
        SELECT
          EXTRACT(HOUR FROM a.answered_at AT TIME ZONE 'Asia/Tashkent')::int AS hour,
          a.user_id,
          a.question_id,
          a.is_correct
        FROM user_question_attempts a
        INNER JOIN users u ON u.id = a.user_id AND u.role = 'USER'
        WHERE a.answered_at >= $1 AND a.answered_at < $2
          AND ${planAttemptSqlParam(4)}
        ${orgFilter}
      ),
      hours AS (
        SELECT generate_series(6, 20) AS hour
      ),
      user_hour_cumulative AS (
        SELECT
          h.hour,
          t.user_id,
          COUNT(DISTINCT t.question_id) FILTER (WHERE t.is_correct) AS distinct_correct
        FROM hours h
        INNER JOIN tz_attempts t ON t.hour <= h.hour
        GROUP BY h.hour, t.user_id
      )
      SELECT
        hour,
        COUNT(*) FILTER (WHERE distinct_correct >= $3)::int AS completed_employees
      FROM user_hour_cumulative
      GROUP BY hour
      ORDER BY hour
      `,
      params,
    )) as Array<{ hour: number; completed_employees: number }>;

    const hours = Array.from({ length: 15 }, (_, i) => i + 6);
    const byHour = new Map(rows.map((r) => [Number(r.hour), Number(r.completed_employees) || 0]));
    let max = 1;
    const points = hours.map((h) => {
      const v = byHour.get(h) ?? 0;
      if (v > max) max = v;
      return { hour: h, label: `${String(h).padStart(2, '0')}:00`, completedEmployees: v };
    });

    return { planDate, orgId: orgId ?? null, points, maxCompleted: max };
  }

  /** Kunlik trend (oxirgi N kun). */
  async getDailyTrend(
    from?: string,
    to?: string,
    orgId?: string,
    allowedOrgIds: string[] | null = null,
  ) {
    const { from: rangeFrom, to: rangeTo, fromStr, toStr } = this.parseRange(from, to);
    const days = this.listDays(fromStr, toStr).slice(-30);

    let orgIds: string[];
    if (orgId) {
      orgIds = [orgId];
    } else if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      return { dailyGoalCorrect: DAILY_GOAL_CORRECT, points: [] };
    } else {
      const orgQb = this.orgRepo.createQueryBuilder('o').select(['o.id']);
      if (allowedOrgIds !== null) {
        orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
      }
      this.applyActiveEnergoOrgFilter(orgQb);
      orgIds = (await orgQb.getMany()).map((o) => o.id);
    }

    const empMap = await this.countEmployeesByOrg(orgIds);
    const totalEmployees = [...empMap.values()].reduce((s, n) => s + n, 0);
    const dailyPlan = totalEmployees * DAILY_GOAL_CORRECT;

    const points: Array<{ date: string; percent: number; completed: number; plan: number }> = [];
    for (const day of days) {
      const correctMap = await this.getUserCorrectMap(orgIds, day);
      let completed = 0;
      for (const [, c] of correctMap) completed += c;
      const percent = dailyPlan > 0 ? Math.round((completed / dailyPlan) * 1000) / 10 : 0;
      points.push({ date: day, percent, completed, plan: dailyPlan });
    }

    return { dailyGoalCorrect: DAILY_GOAL_CORRECT, points };
  }

  /** Filiallar × hafta kuni heatmap (barcha xodimlar asosida, faqat faollar emas). */
  async getBranchWeekdayHeatmap(
    from?: string,
    to?: string,
    allowedOrgIds: string[] | null = null,
    orgId?: string,
  ) {
    const { from: rangeFrom, to: rangeTo, fromStr, toStr } = this.parseRange(from, to);
    const days = this.listDays(fromStr, toStr);
    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select(['o.id', 'o.name', 'o.isDefault']);
    if (orgId) {
      orgQb.where('o.id = :orgId', { orgId });
    } else if (allowedOrgIds !== null) {
      if (allowedOrgIds.length === 0) {
        return {
          weekdays: ['Dush', 'Sesh', 'Chor', 'Pay', 'Juma'],
          branches: [],
          rangeFrom: fromStr,
          rangeTo: toStr,
        };
      }
      orgQb.where('o.id IN (:...ids)', { ids: allowedOrgIds });
    }
    if (!orgId) this.applyActiveEnergoOrgFilter(orgQb);
    const orgs = await orgQb.orderBy('o.name', 'ASC').getMany();
    const orgIds = orgs.map((o) => o.id);
    if (!orgIds.length) {
      return { weekdays: ['Dush', 'Sesh', 'Chor', 'Pay', 'Juma'], branches: [], rangeFrom: '', rangeTo: '' };
    }

    const empCountMap = await this.countEmployeesByOrg(orgIds);

    const orgUsersRows = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('org.id IN (:...orgIds)', { orgIds })
      .andWhere('u.role = :role', { role: Role.USER })
      .select('org.id', 'orgId')
      .addSelect('u.id', 'userId')
      .getRawMany<{ orgId: string; userId: string }>();

    const usersByOrg = new Map<string, string[]>();
    for (const r of orgUsersRows) {
      if (!usersByOrg.has(r.orgId)) usersByOrg.set(r.orgId, []);
      usersByOrg.get(r.orgId)!.push(r.userId);
    }

    const rangeEnd = rangeTo;

    const attemptRows = (await this.attemptRepo.query(
      `
      SELECT
        a.organization_id AS "orgId",
        TO_CHAR(a.answered_at AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS day,
        a.user_id AS "userId",
        LEAST(COUNT(DISTINCT a.question_id) FILTER (WHERE a.is_correct), $4)::int AS correct
      FROM user_question_attempts a
      INNER JOIN users u ON u.id = a.user_id AND u.role = 'USER'
      WHERE a.organization_id = ANY($1::uuid[])
        AND a.answered_at >= $2 AND a.answered_at < $3
        AND ${planAttemptSqlParam(5)}
      GROUP BY 1, 2, 3
      `,
      [orgIds, rangeFrom, rangeEnd, DAILY_GOAL_CORRECT, PLAN_RULE_CUTOFF],
    )) as Array<{ orgId: string; day: string; userId: string; correct: number }>;

    // orgId -> day -> userId -> correct
    const correctLookup = new Map<string, Map<string, Map<string, number>>>();
    for (const r of attemptRows) {
      if (!correctLookup.has(r.orgId)) correctLookup.set(r.orgId, new Map());
      const dayMap = correctLookup.get(r.orgId)!;
      if (!dayMap.has(r.day)) dayMap.set(r.day, new Map());
      dayMap.get(r.day)!.set(r.userId, Number(r.correct) || 0);
    }

    const weekdayLabels = ['Dush', 'Sesh', 'Chor', 'Pay', 'Juma'];
    const weekdayDows = [1, 2, 3, 4, 5];

    const tashkentDow = (dateStr: string): number => {
      const d = new Date(`${dateStr}T12:00:00.000+05:00`);
      return d.getUTCDay();
    };

    const branches = orgs.map((o) => {
      const totalEmployees = empCountMap.get(o.id) ?? 0;
      const userIds = usersByOrg.get(o.id) ?? [];
      const dailyPlan = totalEmployees * DAILY_GOAL_CORRECT;

      const dowBuckets = new Map<number, { sumPct: number; dayCount: number }>();
      for (const dow of weekdayDows) {
        dowBuckets.set(dow, { sumPct: 0, dayCount: 0 });
      }

      for (const day of days) {
        const dow = tashkentDow(day);
        if (!weekdayDows.includes(dow)) continue;
        if (dailyPlan <= 0) continue;

        const dayCorrect = correctLookup.get(o.id)?.get(day);
        let completed = 0;
        for (const uid of userIds) {
          completed += Math.min(dayCorrect?.get(uid) ?? 0, DAILY_GOAL_CORRECT);
        }
        const pct = Math.round((completed / dailyPlan) * 1000) / 10;
        const bucket = dowBuckets.get(dow)!;
        bucket.sumPct += pct;
        bucket.dayCount += 1;
      }

      const cells = weekdayDows.map((dow) => {
        const bucket = dowBuckets.get(dow)!;
        const percent =
          bucket.dayCount > 0
            ? Math.round((bucket.sumPct / bucket.dayCount) * 10) / 10
            : 0;
        return {
          dow,
          label: weekdayLabels[weekdayDows.indexOf(dow)],
          percent,
          sampleDays: bucket.dayCount,
          totalEmployees,
          status: this.statusFromPercent(percent),
        };
      });

      return { orgId: o.id, orgName: o.name, isDefault: !!o.isDefault, totalEmployees, cells };
    });

    const rangeFromStr = days[0] ?? '';
    const rangeToStr = days[days.length - 1] ?? '';

    return {
      weekdays: weekdayLabels,
      branches,
      rangeFrom: rangeFromStr,
      rangeTo: rangeToStr,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
    };
  }

  /** Rejani bajarmayotganlar — filial / bo'lim / xodim soni. */
  async getUnderperformers(
    date?: string,
    threshold = 70,
    allowedOrgIds: string[] | null = null,
  ) {
    const ranking = await this.getBranchRanking(date, allowedOrgIds);
    const badBranches = ranking.branches.filter((b) => b.percent < threshold);

    let badDivisions = 0;
    let badEmployees = 0;
    const branchDetails: Array<{
      orgId: string;
      orgName: string;
      percent: number;
      divisions: Array<{ division: string; percent: number; employees: number }>;
    }> = [];

    for (const b of badBranches) {
      const divSummary = await this.getDivisionSummary(b.orgId, date);
      const badDivs = divSummary.divisions.filter((d) => d.percent < threshold);
      badDivisions += badDivs.length;

      const empRanking = await this.getEmployeeRanking(b.orgId, date);
      const badEmps = empRanking.employees.filter((e) => e.percent < threshold);
      badEmployees += badEmps.length;

      branchDetails.push({
        orgId: b.orgId,
        orgName: b.orgName,
        percent: b.percent,
        divisions: badDivs.map((d) => ({
          division: d.division,
          percent: d.percent,
          employees: d.totalEmployees,
        })),
      });
    }

    return {
      planDate: ranking.planDate,
      threshold,
      branchCount: badBranches.length,
      divisionCount: badDivisions,
      employeeCount: badEmployees,
      branches: branchDetails,
    };
  }

  private narrowOrgScope(
    allowedOrgIds: string[] | null,
    orgId?: string,
  ): string[] | null {
    // [] = ruxsat yo‘q — hech qanday org (barcha emas!)
    if (allowedOrgIds !== null && allowedOrgIds.length === 0) {
      throw new ForbiddenException('Bu filialga ruxsat yo‘q');
    }
    const id = orgId?.trim();
    if (!id || id === 'all') return allowedOrgIds;
    if (allowedOrgIds && !allowedOrgIds.includes(id)) {
      throw new ForbiddenException('Bu filialga ruxsat yo‘q');
    }
    return [id];
  }

  /** Kunlik hisobot — dashboard + filiallar + barcha xodimlar. */
  async getDailyReport(
    date?: string,
    allowedOrgIds: string[] | null = null,
    orgId?: string,
  ) {
    const scope = this.narrowOrgScope(allowedOrgIds, orgId);
    const dashboard = await this.getExecutiveDashboard(date, scope);
    const ranking = await this.getBranchRanking(date, scope);
    const planDate = ranking.planDate;

    const employees: Array<{
      orgId: string;
      orgName: string;
      userId: string;
      fullName: string;
      answeredCount: number;
      planCorrect: number;
      extraCorrect: number;
      percent: number;
      completed: boolean;
      status: 'green' | 'yellow' | 'red';
    }> = [];

    for (const branch of ranking.branches) {
      const planResult = await this.getDailyPlanResult(branch.orgId, planDate);
      for (const u of planResult.userResults) {
        employees.push({
          orgId: branch.orgId,
          orgName: branch.orgName,
          userId: u.userId,
          fullName: u.fullName,
          answeredCount: u.answeredCount,
          planCorrect: u.planCorrectCount,
          extraCorrect: u.extraCorrectCount,
          percent: u.completionPercent,
          completed: u.completed,
          status: this.statusFromPercent(u.completionPercent),
        });
      }
    }

    employees.sort(
      (a, b) =>
        b.percent - a.percent ||
        b.extraCorrect - a.extraCorrect ||
        a.fullName.localeCompare(b.fullName),
    );

    return {
      ...dashboard,
      planDate,
      branches: ranking.branches,
      employees,
    };
  }

  /** Oylik hisobot — filial taqqoslash + kunlik trend + xodimlar. */
  async getMonthlyReport(
    month?: string,
    allowedOrgIds: string[] | null = null,
    orgId?: string,
  ) {
    const scope = this.narrowOrgScope(allowedOrgIds, orgId);
    const comparison = await this.getBranchComparison(month, scope);
    const { month: m, daysInMonth } = tashkentMonthBounds(month);
    const lastDay = `${m}-${String(daysInMonth).padStart(2, '0')}`;
    const trend = await this.getDailyTrend(`${m}-01`, lastDay, undefined, scope);

    const branchRows: Array<{
      orgId: string;
      orgName: string;
      totalEmployees: number;
      averageMonthlyPercent: number;
      extraCorrectTotal: number;
      rank: number;
    }> = [];

    const employees: Array<{
      orgId: string;
      orgName: string;
      userId: string;
      fullName: string;
      email: string;
      daysCompleted: number;
      monthlyPercent: number;
      extraCorrectTotal: number;
      correctTotal: number;
      wrongTotal: number;
    }> = [];

    for (const branch of comparison.branches) {
      const progress = await this.getMonthlyProgress(branch.orgId, m);
      const extraCorrectTotal = progress.employees.reduce(
        (s, e) => s + (e.extraCorrectTotal ?? 0),
        0,
      );
      branchRows.push({
        orgId: branch.orgId,
        orgName: branch.orgName,
        totalEmployees: branch.totalEmployees,
        averageMonthlyPercent: branch.averageMonthlyPercent,
        extraCorrectTotal,
        rank: branch.rank,
      });
      for (const emp of progress.employees) {
        employees.push({
          orgId: branch.orgId,
          orgName: progress.orgName,
          userId: emp.userId,
          fullName: emp.fullName,
          email: emp.email,
          daysCompleted: emp.daysCompleted,
          monthlyPercent: emp.monthlyPercent,
          extraCorrectTotal: emp.extraCorrectTotal ?? 0,
          correctTotal: emp.correctTotal,
          wrongTotal: emp.wrongTotal,
        });
      }
    }

    return {
      month: m,
      daysInMonth: comparison.daysInMonth,
      dailyGoalCorrect: DAILY_GOAL_CORRECT,
      branches: branchRows,
      trend: trend.points,
      employees,
    };
  }
}
