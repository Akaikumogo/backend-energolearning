import {
  addTashkentDays,
  instantToTashkentDate,
  listTashkentDays,
  parseTashkentRange,
  tashkentDayBounds,
  tashkentMonthBounds,
  tashkentToday,
} from './tashkent-time.util';

describe('tashkent-time.util', () => {
  it('tashkentToday uses UTC+5 calendar day', () => {
    // 2026-07-08 22:00 UTC = 2026-07-09 03:00 Tashkent
    const ms = Date.parse('2026-07-08T22:00:00.000Z');
    expect(tashkentToday(ms)).toBe('2026-07-09');
  });

  it('tashkentDayBounds are +05:00 aligned', () => {
    const { from, to } = tashkentDayBounds('2026-07-09');
    expect(from.toISOString()).toBe('2026-07-08T19:00:00.000Z');
    expect(to.toISOString()).toBe('2026-07-09T19:00:00.000Z');
  });

  it('addTashkentDays crosses month boundary', () => {
    expect(addTashkentDays('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('parseTashkentRange defaults to 28 days ending at to', () => {
    const r = parseTashkentRange(undefined, '2026-07-09', 28);
    expect(r.toStr).toBe('2026-07-09');
    expect(r.fromStr).toBe('2026-06-12');
    expect(listTashkentDays(r.fromStr, r.toStr).length).toBe(28);
  });

  it('listTashkentDays is inclusive', () => {
    expect(listTashkentDays('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
  });

  it('instantToTashkentDate matches backend daily plan day key', () => {
    const instant = new Date('2026-07-08T20:30:00.000Z'); // 01:30 next day in Tashkent
    expect(instantToTashkentDate(instant)).toBe('2026-07-09');
  });

  it('tashkentMonthBounds accepts YYYY-MM (not only YYYY-MM-DD)', () => {
    const r = tashkentMonthBounds('2026-07');
    expect(r.month).toBe('2026-07');
    expect(r.daysInMonth).toBe(31);
    expect(r.from.toISOString()).toBe('2026-06-30T19:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-07-31T19:00:00.000Z');
  });

  it('tashkentMonthBounds accepts YYYY-MM-DD by taking month prefix', () => {
    expect(tashkentMonthBounds('2026-02-15').month).toBe('2026-02');
    expect(tashkentMonthBounds('2026-02-15').daysInMonth).toBe(28);
  });
});
