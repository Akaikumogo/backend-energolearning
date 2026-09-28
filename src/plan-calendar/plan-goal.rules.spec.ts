import {
  dayPlanResult,
  isWeekend,
  PlanGoalResolver,
  resolveDailyGoal,
} from './plan-goal.rules';

describe('plan goal rules', () => {
  it('keeps the old fixed goal before the calendar start', () => {
    expect(resolveDailyGoal({ day: '2026-06-20' })).toBe(10);
    expect(
      resolveDailyGoal({ day: '2026-06-14', calendarDay: { goal: 0, isDayOff: true } }),
    ).toBe(10);
  });

  it('applies the calendar from the database start date', () => {
    expect(resolveDailyGoal({ day: '2026-06-21' })).toBe(0);
    expect(resolveDailyGoal({ day: '2026-06-22' })).toBe(10);
    expect(resolveDailyGoal({ day: '2026-09-27' })).toBe(0);
    expect(
      resolveDailyGoal({ day: '2026-09-01', calendarDay: { goal: null, isDayOff: true } }),
    ).toBe(0);
  });

  it('treats Saturday and Sunday as days off', () => {
    expect(isWeekend('2026-10-03')).toBe(true);
    expect(isWeekend('2026-10-04')).toBe(true);
    expect(isWeekend('2026-10-05')).toBe(false);
    expect(resolveDailyGoal({ day: '2026-10-03' })).toBe(0);
    expect(resolveDailyGoal({ day: '2026-10-05' })).toBe(10);
  });

  it('applies holidays, working Saturdays and admin goals', () => {
    expect(
      resolveDailyGoal({
        day: '2026-10-01',
        calendarDay: { goal: null, isDayOff: true, holidayName: "O'qituvchilar kuni" },
      }),
    ).toBe(0);
    expect(
      resolveDailyGoal({ day: '2026-12-12', calendarDay: { goal: null, isDayOff: false } }),
    ).toBe(10);
    expect(
      resolveDailyGoal({ day: '2026-10-05', calendarDay: { goal: 15, isDayOff: null } }),
    ).toBe(15);
    expect(
      resolveDailyGoal({ day: '2026-10-05', calendarDay: { goal: 0, isDayOff: null } }),
    ).toBe(0);
  });

  it('prefers user day override, then calendar, then user norm', () => {
    const r = new PlanGoalResolver(
      new Map([['2026-10-06', { goal: 20, isDayOff: null }]]),
      new Map([['u1:2026-10-07', 5]]),
      new Map([['u1', 12]]),
    );
    expect(r.goal('u1', '2026-10-07')).toBe(5);
    expect(r.goal('u1', '2026-10-06')).toBe(20);
    expect(r.goal('u1', '2026-10-05')).toBe(12);
    expect(r.goal('u2', '2026-10-05')).toBe(10);
    expect(r.goal('u1', '2026-10-04')).toBe(0);
    expect(
      r.plannedDays('u1', ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']),
    ).toBe(2);
  });

  it('computes day results for plan and plan-0 days', () => {
    expect(dayPlanResult(12, 10)).toEqual({
      goal: 10,
      planCorrect: 10,
      extraCorrect: 2,
      completed: true,
    });
    expect(dayPlanResult(7, 0)).toEqual({
      goal: 0,
      planCorrect: 0,
      extraCorrect: 7,
      completed: false,
    });
  });
});
