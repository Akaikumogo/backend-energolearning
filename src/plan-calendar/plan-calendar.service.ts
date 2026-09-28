import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Not, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import {
  addTashkentDays,
  listTashkentDays,
  tashkentMonthBounds,
  tashkentToday,
} from '../common/utils/tashkent-time.util';
import { PlanCalendarDay } from '../database/entities/plan-calendar-day.entity';
import {
  PlanChangeKind,
  PlanChangeLog,
} from '../database/entities/plan-change-log.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserPlanDayOverride } from '../database/entities/user-plan-day-override.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  CalendarDaySetting,
  DEFAULT_DAILY_GOAL,
  PLAN_CALENDAR_START,
  PlanGoalResolver,
  isDayOff,
  isWeekend,
  resolveDailyGoal,
} from './plan-goal.rules';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GOAL = 200;

type Actor = { id: string; role: Role; organizationIds: string[] };

function assertDay(day: string): string {
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new BadRequestException('Sana YYYY-MM-DD formatida bo‘lishi kerak');
  }
  return day;
}

function assertGoal(goal: number | null | undefined): number | null {
  if (goal == null) return null;
  if (!Number.isInteger(goal) || goal < 0 || goal > MAX_GOAL) {
    throw new BadRequestException(`Norma 0..${MAX_GOAL} oralig‘ida butun son bo‘lishi kerak`);
  }
  return goal;
}

function toSetting(row: PlanCalendarDay): CalendarDaySetting {
  return { goal: row.goal, isDayOff: row.isDayOff, holidayName: row.holidayName };
}

@Injectable()
export class PlanCalendarService {
  constructor(
    @InjectRepository(PlanCalendarDay)
    private readonly dayRepo: Repository<PlanCalendarDay>,
    @InjectRepository(UserPlanDayOverride)
    private readonly overrideRepo: Repository<UserPlanDayOverride>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(PlanChangeLog)
    private readonly logRepo: Repository<PlanChangeLog>,
    private readonly orgService: OrganizationsService,
  ) {}

  /** Hisobotlar uchun: [from, to] oralig'idagi barcha sozlamalar bir marta yuklanadi. */
  async loadResolver(from: string, to: string): Promise<PlanGoalResolver> {
    if (to < PLAN_CALENDAR_START) return PlanGoalResolver.constant();
    const start = from < PLAN_CALENDAR_START ? PLAN_CALENDAR_START : from;

    const [days, overrides, norms] = await Promise.all([
      this.dayRepo.find({ where: { day: Between(start, to) } }),
      this.overrideRepo.find({ where: { day: Between(start, to) } }),
      this.userRepo.find({
        where: { dailyPlanGoal: Not(IsNull()) },
        select: { id: true, dailyPlanGoal: true },
      }),
    ]);

    return new PlanGoalResolver(
      new Map(days.map((d) => [d.day, toSetting(d)])),
      new Map(overrides.map((o) => [`${o.userId}:${o.day}`, o.goal])),
      new Map(norms.map((u) => [u.id, u.dailyPlanGoal as number])),
    );
  }

  async goalFor(userId: string, day: string = tashkentToday()): Promise<number> {
    if (day < PLAN_CALENDAR_START) return DEFAULT_DAILY_GOAL;
    const [calendarDay, override, user] = await Promise.all([
      this.dayRepo.findOne({ where: { day } }),
      this.overrideRepo.findOne({ where: { userId, day } }),
      this.userRepo.findOne({ where: { id: userId }, select: { id: true, dailyPlanGoal: true } }),
    ]);
    return resolveDailyGoal({
      day,
      userDayGoal: override?.goal,
      calendarDay: calendarDay ? toSetting(calendarDay) : undefined,
      userNorm: user?.dailyPlanGoal,
    });
  }

  private monthDays(month?: string) {
    const { month: m, daysInMonth } = tashkentMonthBounds(month);
    const start = `${m}-01`;
    const end = addTashkentDays(start, daysInMonth - 1);
    return { month: m, start, end, days: listTashkentDays(start, end) };
  }

  async getMonth(month?: string) {
    const { month: m, start, end } = this.monthDays(month);
    const rows = await this.dayRepo.find({ where: { day: Between(start, end) } });
    return this.buildMonth(m, new Map(rows.map((r) => [r.day, r])));
  }

  /** Yillik plan: 12 oy, har birida kunlar va jami (doimiy normasi yo'q xodim uchun). */
  async getYear(year?: string) {
    const y = /^\d{4}$/.test(year ?? '') ? String(year) : tashkentToday().slice(0, 4);
    const rows = await this.dayRepo.find({
      where: { day: Between(`${y}-01-01`, `${y}-12-31`) },
    });
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const months = Array.from({ length: 12 }, (_, i) =>
      this.buildMonth(`${y}-${String(i + 1).padStart(2, '0')}`, byDay),
    );
    const applied = months.flatMap((mo) => mo.days).filter((d) => d.calendarApplies);
    return {
      year: y,
      defaultGoal: DEFAULT_DAILY_GOAL,
      calendarStart: PLAN_CALENDAR_START,
      workingDays: months.reduce((s, mo) => s + mo.workingDays, 0),
      totalGoal: months.reduce((s, mo) => s + mo.totalGoal, 0),
      daysOff: applied.filter((d) => d.goal === 0).length,
      holidays: applied
        .filter((d) => d.holidayName)
        .map((d) => ({ date: d.date, name: d.holidayName, isDayOff: d.isDayOff })),
      months: months.map((mo) => ({
        month: mo.month,
        workingDays: mo.workingDays,
        totalGoal: mo.totalGoal,
        days: mo.days,
      })),
    };
  }

  private buildMonth(month: string, byDay: Map<string, PlanCalendarDay>) {
    const { month: m, days } = this.monthDays(month);
    const items = days.map((day) => {
      const row = byDay.get(day);
      const setting = row ? toSetting(row) : undefined;
      const dayOff = isDayOff(day, setting);
      return {
        date: day,
        isWeekend: isWeekend(day),
        isDayOff: dayOff,
        holidayName: row?.holidayName ?? null,
        customGoal: row?.goal ?? null,
        /** Doimiy normasi yo'q xodim uchun shu kungi plan. */
        goal: resolveDailyGoal({ day, calendarDay: setting }),
        note: row?.note ?? null,
        source: row?.source ?? null,
        hasOverride: !!row,
        calendarApplies: day >= PLAN_CALENDAR_START,
      };
    });

    const planDays = items.filter((d) => d.calendarApplies && d.goal > 0);
    return {
      month: m,
      defaultGoal: DEFAULT_DAILY_GOAL,
      calendarStart: PLAN_CALENDAR_START,
      workingDays: planDays.length,
      totalGoal: planDays.reduce((s, d) => s + d.goal, 0),
      days: items,
    };
  }

  /** Planni faqat superadmin yoki markaziy apparat (asosiy tashkilot) moderatori o'zgartiradi. */
  async canEditPlans(actor: Actor): Promise<boolean> {
    if (actor.role === Role.SUPERADMIN) return true;
    if (actor.role !== Role.MODERATOR) return false;
    return this.orgService.isDefaultModerator(actor.organizationIds ?? []);
  }

  private async assertPlanEditor(actor: Actor) {
    if (!(await this.canEditPlans(actor))) {
      throw new ForbiddenException(
        'Planni faqat markaziy apparat xodimlari o‘zgartira oladi',
      );
    }
  }

  private async log(entry: {
    actorId: string;
    targetUserId?: string | null;
    kind: PlanChangeKind;
    action: 'SET' | 'RESET';
    day?: string | null;
    oldGoal: number | null;
    newGoal: number | null;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  }) {
    const row = new PlanChangeLog();
    row.actorId = entry.actorId;
    row.targetUserId = entry.targetUserId ?? null;
    row.kind = entry.kind;
    row.action = entry.action;
    row.day = entry.day ?? null;
    row.oldGoal = entry.oldGoal;
    row.newGoal = entry.newGoal;
    row.oldValue = entry.oldValue ?? null;
    row.newValue = entry.newValue ?? null;
    await this.logRepo.save(row);
  }

  private daySnapshot(day: string, row: PlanCalendarDay | null) {
    return {
      goal: resolveDailyGoal({ day, calendarDay: row ? toSetting(row) : undefined }),
      value: row
        ? {
            goal: row.goal,
            isDayOff: row.isDayOff,
            holidayName: row.holidayName,
            note: row.note,
          }
        : null,
    };
  }

  async setDay(
    day: string,
    body: { goal?: number | null; isDayOff?: boolean | null; holidayName?: string | null; note?: string | null },
    actor: Actor,
  ) {
    await this.assertPlanEditor(actor);
    assertDay(day);
    const goal = assertGoal(body.goal);
    const existing = await this.dayRepo.findOne({ where: { day } });
    const before = this.daySnapshot(day, existing);
    const row = existing ?? this.dayRepo.create({ day, source: 'ADMIN' });
    row.goal = goal;
    row.isDayOff = body.isDayOff ?? null;
    row.holidayName = body.holidayName?.trim() || null;
    row.note = body.note?.trim() || null;
    row.updatedBy = actor.id;
    await this.dayRepo.save(row);
    const after = this.daySnapshot(day, row);
    await this.log({
      actorId: actor.id,
      kind: 'CALENDAR_DAY',
      action: 'SET',
      day,
      oldGoal: before.goal,
      newGoal: after.goal,
      oldValue: before.value,
      newValue: after.value,
    });
    return this.getMonth(day.slice(0, 7));
  }

  async resetDay(day: string, actor: Actor) {
    await this.assertPlanEditor(actor);
    assertDay(day);
    const existing = await this.dayRepo.findOne({ where: { day } });
    if (existing) {
      const before = this.daySnapshot(day, existing);
      await this.dayRepo.delete({ day });
      await this.log({
        actorId: actor.id,
        kind: 'CALENDAR_DAY',
        action: 'RESET',
        day,
        oldGoal: before.goal,
        newGoal: this.daySnapshot(day, null).goal,
        oldValue: before.value,
      });
    }
    return this.getMonth(day.slice(0, 7));
  }

  private async assertUserInScope(userId: string, actor: Actor) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, dailyPlanGoal: true },
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');

    const allowed = await this.orgService.getAllowedOrgIds(actor.role, actor.organizationIds);
    if (allowed !== null) {
      const inScope =
        allowed.length > 0 &&
        (await this.userOrgRepo
          .createQueryBuilder('uo')
          .where('uo."userId" = :userId', { userId })
          .andWhere('uo."organizationId" IN (:...allowed)', { allowed })
          .getCount()) > 0;
      if (!inScope) throw new ForbiddenException('Bu xodimga ruxsat yo‘q');
    }
    return user;
  }

  async getUserPlan(userId: string, actor: Actor, month?: string) {
    const user = await this.assertUserInScope(userId, actor);
    return this.buildUserPlan(user, month);
  }

  /** Xodimning o'z plani (mobil profil, faqat ko'rish). */
  async getOwnPlan(userId: string, month?: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, dailyPlanGoal: true },
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    return this.buildUserPlan(user, month);
  }

  private async buildUserPlan(
    user: Pick<User, 'id' | 'firstName' | 'lastName' | 'dailyPlanGoal'>,
    month?: string,
  ) {
    const userId = user.id;
    const { month: m, start, end, days } = this.monthDays(month);
    const [rows, overrides] = await Promise.all([
      this.dayRepo.find({ where: { day: Between(start, end) } }),
      this.overrideRepo.find({ where: { userId, day: Between(start, end) } }),
    ]);
    const byDay = new Map(rows.map((r) => [r.day, toSetting(r)]));
    const overrideByDay = new Map(overrides.map((o) => [o.day, o]));

    const items = days.map((day) => {
      const setting = byDay.get(day);
      const override = overrideByDay.get(day);
      return {
        date: day,
        isWeekend: isWeekend(day),
        isDayOff: isDayOff(day, setting),
        holidayName: setting?.holidayName ?? null,
        /** Hamma uchun (xodim normasi hisobga olingan) plan. */
        baseGoal: resolveDailyGoal({ day, calendarDay: setting, userNorm: user.dailyPlanGoal }),
        userGoal: override?.goal ?? null,
        note: override?.note ?? null,
        goal: resolveDailyGoal({
          day,
          userDayGoal: override?.goal,
          calendarDay: setting,
          userNorm: user.dailyPlanGoal,
        }),
        calendarApplies: day >= PLAN_CALENDAR_START,
      };
    });

    const planDays = items.filter((d) => d.goal > 0);
    return {
      userId,
      fullName: `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim(),
      month: m,
      defaultGoal: DEFAULT_DAILY_GOAL,
      dailyPlanGoal: user.dailyPlanGoal,
      calendarStart: PLAN_CALENDAR_START,
      workingDays: planDays.length,
      totalGoal: planDays.reduce((s, d) => s + d.goal, 0),
      days: items,
    };
  }

  async setUserNorm(userId: string, goal: number | null, actor: Actor, month?: string) {
    await this.assertPlanEditor(actor);
    const user = await this.assertUserInScope(userId, actor);
    const next = assertGoal(goal);
    if ((user.dailyPlanGoal ?? null) !== next) {
      await this.userRepo.update({ id: userId }, { dailyPlanGoal: next });
      await this.log({
        actorId: actor.id,
        targetUserId: userId,
        kind: 'USER_NORM',
        action: next == null ? 'RESET' : 'SET',
        oldGoal: user.dailyPlanGoal ?? null,
        newGoal: next,
      });
    }
    return this.getUserPlan(userId, actor, month);
  }

  async setUserDay(userId: string, day: string, goal: number, note: string | null | undefined, actor: Actor) {
    await this.assertPlanEditor(actor);
    await this.assertUserInScope(userId, actor);
    assertDay(day);
    const value = assertGoal(goal);
    if (value == null) throw new BadRequestException('Norma kiritilmagan');
    const oldGoal = await this.goalFor(userId, day);
    const existing = await this.overrideRepo.findOne({ where: { userId, day } });
    const row = existing ?? this.overrideRepo.create({ userId, day });
    row.goal = value;
    row.note = note?.trim() || null;
    row.updatedBy = actor.id;
    await this.overrideRepo.save(row);
    await this.log({
      actorId: actor.id,
      targetUserId: userId,
      kind: 'USER_DAY',
      action: 'SET',
      day,
      oldGoal,
      newGoal: value,
      newValue: row.note ? { note: row.note } : null,
    });
    return this.getUserPlan(userId, actor, day.slice(0, 7));
  }

  async resetUserDay(userId: string, day: string, actor: Actor) {
    await this.assertPlanEditor(actor);
    await this.assertUserInScope(userId, actor);
    assertDay(day);
    const existing = await this.overrideRepo.findOne({ where: { userId, day } });
    if (existing) {
      await this.overrideRepo.delete({ userId, day });
      await this.log({
        actorId: actor.id,
        targetUserId: userId,
        kind: 'USER_DAY',
        action: 'RESET',
        day,
        oldGoal: existing.goal,
        newGoal: await this.goalFor(userId, day),
      });
    }
    return this.getUserPlan(userId, actor, day.slice(0, 7));
  }

  /** Superadmin: plan o'zgarishlari tarixi (kim, kimning planini, qachon). */
  async getChanges(query: {
    page?: number;
    limit?: number;
    kind?: string;
    actorId?: string;
    search?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: string[] = [];
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.kind && ['CALENDAR_DAY', 'USER_NORM', 'USER_DAY'].includes(query.kind)) {
      where.push(`l.kind = ${param(query.kind)}`);
    }
    if (query.actorId && /^[0-9a-f-]{36}$/i.test(query.actorId)) {
      where.push(`l.actor_id = ${param(query.actorId)}::uuid`);
    }
    const search = query.search?.trim();
    if (search) {
      const p = param(`%${search}%`);
      where.push(
        `(CONCAT_WS(' ', t.last_name, t.first_name) ILIKE ${p} OR CONCAT_WS(' ', a.last_name, a.first_name) ILIKE ${p})`,
      );
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const from = `
      FROM plan_change_logs l
      LEFT JOIN users a ON a.id = l.actor_id
      LEFT JOIN users t ON t.id = l.target_user_id
      ${whereSql}
    `;
    const [rows, countRows, actors] = await Promise.all([
      this.logRepo.query(
        `
        SELECT l.id, l.kind, l.action, TO_CHAR(l.day, 'YYYY-MM-DD') AS day,
               l.old_goal AS "oldGoal", l.new_goal AS "newGoal",
               l.old_value AS "oldValue", l.new_value AS "newValue",
               l.created_at AS "createdAt",
               l.actor_id AS "actorId",
               CONCAT_WS(' ', a.last_name, a.first_name) AS "actorName",
               a.role AS "actorRole",
               l.target_user_id AS "targetUserId",
               CONCAT_WS(' ', t.last_name, t.first_name) AS "targetName",
               (SELECT o.name FROM user_organizations uo
                  JOIN organizations o ON o.id = uo."organizationId"
                 WHERE uo."userId" = l.target_user_id LIMIT 1) AS "targetOrgName"
        ${from}
        ORDER BY l.created_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
        `,
        params,
      ),
      this.logRepo.query(`SELECT COUNT(*)::int AS n ${from}`, params),
      this.logRepo.query(`
        SELECT DISTINCT l.actor_id AS id, CONCAT_WS(' ', a.last_name, a.first_name) AS name
        FROM plan_change_logs l JOIN users a ON a.id = l.actor_id
        ORDER BY name
      `),
    ]);
    return {
      data: rows,
      total: Number(countRows[0]?.n) || 0,
      page,
      limit,
      actors: actors as Array<{ id: string; name: string }>,
    };
  }

  /** Superadmin: hozir shaxsiy plani bor xodimlar (doimiy norma yoki bugundan keyingi kunlar). */
  async getCustomPlans() {
    const today = tashkentToday();
    const rows = await this.userRepo.query(
      `
      WITH targets AS (
        SELECT id AS user_id FROM users WHERE daily_plan_goal IS NOT NULL
        UNION
        SELECT user_id FROM user_plan_day_overrides WHERE day >= $1::date
      )
      SELECT u.id AS "userId",
             CONCAT_WS(' ', u.last_name, u.first_name) AS "fullName",
             (SELECT o.name FROM user_organizations uo
                JOIN organizations o ON o.id = uo."organizationId"
               WHERE uo."userId" = u.id LIMIT 1) AS "orgName",
             u.daily_plan_goal AS "dailyPlanGoal",
             COALESCE((
               SELECT json_agg(json_build_object('day', TO_CHAR(o.day, 'YYYY-MM-DD'), 'goal', o.goal) ORDER BY o.day)
               FROM user_plan_day_overrides o
               WHERE o.user_id = u.id AND o.day >= $1::date
             ), '[]'::json) AS "upcomingDays",
             lc.created_at AS "lastChangedAt",
             CONCAT_WS(' ', a.last_name, a.first_name) AS "lastChangedBy"
      FROM targets tg
      JOIN users u ON u.id = tg.user_id
      LEFT JOIN LATERAL (
        SELECT l.created_at, l.actor_id FROM plan_change_logs l
        WHERE l.target_user_id = u.id ORDER BY l.created_at DESC LIMIT 1
      ) lc ON true
      LEFT JOIN users a ON a.id = lc.actor_id
      ORDER BY lc.created_at DESC NULLS LAST, "fullName"
      `,
      [today],
    );
    return { today, users: rows };
  }
}
