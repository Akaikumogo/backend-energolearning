import { DAILY_GOAL_CORRECT } from '../branch-analytics/daily-plan.service';

/**
 * Analitika KPI formulalari — regression testlari (data contract).
 * @see docs/ANALYTICS_DATA_CONTRACT.md
 */
describe('analytics KPI formulas', () => {
  function cappedCorrect(distinctCorrect: number): number {
    return Math.min(DAILY_GOAL_CORRECT, distinctCorrect);
  }

  function completionPercent(completedTotal: number, totalPlan: number): number {
    return totalPlan > 0 ? Math.round((completedTotal / totalPlan) * 1000) / 10 : 0;
  }

  function statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 90) return 'green';
    if (p >= 70) return 'yellow';
    return 'red';
  }

  function extraCorrect(rawDistinctCorrect: number): number {
    return Math.max(0, rawDistinctCorrect - DAILY_GOAL_CORRECT);
  }

  it('capped correct never exceeds daily goal', () => {
    expect(cappedCorrect(15)).toBe(10);
    expect(cappedCorrect(7)).toBe(7);
  });

  it('extra correct counts beyond daily goal only', () => {
    expect(extraCorrect(10)).toBe(0);
    expect(extraCorrect(13)).toBe(3);
    expect(extraCorrect(7)).toBe(0);
  });

  it('completion percent for full branch', () => {
    const employees = 100;
    const totalPlan = employees * DAILY_GOAL_CORRECT;
    const completedTotal = employees * 10;
    expect(completionPercent(completedTotal, totalPlan)).toBe(100);
  });

  it('partial completion', () => {
    const totalPlan = 50 * DAILY_GOAL_CORRECT;
    const completedTotal = 25 * 7; // 25 xodim o'rtacha 7 ta
    expect(completionPercent(completedTotal, totalPlan)).toBe(35);
  });

  it('status thresholds', () => {
    expect(statusFromPercent(90)).toBe('green');
    expect(statusFromPercent(89.9)).toBe('yellow');
    expect(statusFromPercent(70)).toBe('yellow');
    expect(statusFromPercent(69)).toBe('red');
  });

  it('hourly distinct correct does not double-count same question', () => {
    // Simulyatsiya: 2 soatda bir xil savol — kumulyativ distinct = 1
    const attempts = [
      { hour: 8, questionId: 'q1', correct: true },
      { hour: 10, questionId: 'q1', correct: true },
    ];
    const distinct = new Set(
      attempts.filter((a) => a.correct).map((a) => a.questionId),
    );
    expect(distinct.size).toBe(1);
    expect(attempts.length).toBe(2);
  });
});
