/**
 * Kunlik plan normasini aniqlash qoidasi. SQL'dagi `effective_daily_goal()`
 * (migration 0048) bilan bir xil bo'lishi shart.
 *
 * Ustuvorlik: xodimning kun normasi → hamma uchun kun normasi →
 * dam olish kuni (0) → xodimning doimiy normasi → standart.
 */
export const DEFAULT_DAILY_GOAL = 10;

/** Baza yaratilgan kun: shundan oldingi kunlar uchun kalendar qo'llanmaydi. */
export const PLAN_CALENDAR_START = '2026-06-21';

/**
 * Plan 0 kunidagi "birinchi xatogacha" bonus qoidasi shu kundan kuchga kirgan.
 * Undan oldin berilgan XP qayta hisoblanmaydi (kuniga 10 tagacha to'g'ri javob).
 */
export const XP_BONUS_RULE_START = '2026-09-28';

/** Plan 0 bo'lgan kunda ketma-ket to'g'ri javoblar bonusi (har biri 10 XP). */
export const BONUS_STREAK_MAX = 10;

export type CalendarDaySetting = {
  goal: number | null;
  isDayOff: boolean | null;
  holidayName?: string | null;
};

/** 1 = dushanba ... 7 = yakshanba (YYYY-MM-DD, kalendar sanasi). */
export function isoWeekday(day: string): number {
  const dow = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function isWeekend(day: string): boolean {
  return isoWeekday(day) >= 6;
}

export function isDayOff(day: string, setting?: CalendarDaySetting): boolean {
  return setting?.isDayOff ?? isWeekend(day);
}

export function resolveDailyGoal(input: {
  day: string;
  userDayGoal?: number | null;
  calendarDay?: CalendarDaySetting;
  userNorm?: number | null;
}): number {
  if (input.day < PLAN_CALENDAR_START) return DEFAULT_DAILY_GOAL;
  if (input.userDayGoal != null) return input.userDayGoal;
  if (input.calendarDay?.goal != null) return input.calendarDay.goal;
  if (isDayOff(input.day, input.calendarDay)) return 0;
  return input.userNorm ?? DEFAULT_DAILY_GOAL;
}

/** Bir martalik yuklangan kalendar ma'lumotlari asosida xodim × kun normasi. */
export class PlanGoalResolver {
  constructor(
    private readonly calendarDays: Map<string, CalendarDaySetting>,
    /** key: `${userId}:${day}` */
    private readonly userDayGoals: Map<string, number>,
    private readonly userNorms: Map<string, number>,
  ) {}

  static constant(): PlanGoalResolver {
    return new PlanGoalResolver(new Map(), new Map(), new Map());
  }

  goal(userId: string, day: string): number {
    return resolveDailyGoal({
      day,
      userDayGoal: this.userDayGoals.get(`${userId}:${day}`),
      calendarDay: this.calendarDays.get(day),
      userNorm: this.userNorms.get(userId),
    });
  }

  /** Plan 0 bo'lgan kunlar foizga kirmaydi. */
  plannedDays(userId: string, days: string[]): number {
    let n = 0;
    for (const d of days) if (this.goal(userId, d) > 0) n++;
    return n;
  }
}

/** Kun natijasi: plan bo'yicha to'g'ri / ortiqcha / bajarildi. */
export function dayPlanResult(rawCorrect: number, goal: number) {
  const planCorrect = Math.min(rawCorrect, goal);
  return {
    goal,
    planCorrect,
    extraCorrect: Math.max(0, rawCorrect - goal),
    completed: goal > 0 && rawCorrect >= goal,
  };
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}
