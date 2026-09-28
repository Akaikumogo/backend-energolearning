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
    const { month: m, start, end, days } = this.monthDays(month);
    const rows = await this.dayRepo.find({ where: { day: Between(start, end) } });
    const byDay = new Map(rows.map((r) => [r.day, r]));

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

    const planDays = items.filter((d) => d.goal > 0);
    return {
      month: m,
      defaultGoal: DEFAULT_DAILY_GOAL,
      calendarStart: PLAN_CALENDAR_START,
      workingDays: planDays.length,
      totalGoal: planDays.reduce((s, d) => s + d.goal, 0),
      days: items,
    };
  }

  async setDay(
    day: string,
    body: { goal?: number | null; isDayOff?: boolean | null; holidayName?: string | null; note?: string | null },
    actorId: string,
  ) {
    assertDay(day);
    const goal = assertGoal(body.goal);
    const existing = await this.dayRepo.findOne({ where: { day } });
    const row = existing ?? this.dayRepo.create({ day, source: 'ADMIN' });
    row.goal = goal;
    row.isDayOff = body.isDayOff ?? null;
    row.holidayName = body.holidayName?.trim() || null;
    row.note = body.note?.trim() || null;
    row.updatedBy = actorId;
    await this.dayRepo.save(row);
    return this.getMonth(day.slice(0, 7));
  }

  async resetDay(day: string) {
    assertDay(day);
    await this.dayRepo.delete({ day });
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
    await this.assertUserInScope(userId, actor);
    await this.userRepo.update({ id: userId }, { dailyPlanGoal: assertGoal(goal) });
    return this.getUserPlan(userId, actor, month);
  }

  async setUserDay(userId: string, day: string, goal: number, note: string | null | undefined, actor: Actor) {
    await this.assertUserInScope(userId, actor);
    assertDay(day);
    const value = assertGoal(goal);
    if (value == null) throw new BadRequestException('Norma kiritilmagan');
    const existing = await this.overrideRepo.findOne({ where: { userId, day } });
    const row = existing ?? this.overrideRepo.create({ userId, day });
    row.goal = value;
    row.note = note?.trim() || null;
    row.updatedBy = actor.id;
    await this.overrideRepo.save(row);
    return this.getUserPlan(userId, actor, day.slice(0, 7));
  }

  async resetUserDay(userId: string, day: string, actor: Actor) {
    await this.assertUserInScope(userId, actor);
    assertDay(day);
    await this.overrideRepo.delete({ userId, day });
    return this.getUserPlan(userId, actor, day.slice(0, 7));
  }
}
