/** Asia/Tashkent (UTC+5, DST yo'q) — analitika uchun yagona vaqt zonasi. */
export const TZ_OFFSET_MS = 5 * 3600 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Toshkent bo'yicha bugungi sana YYYY-MM-DD. */
export function tashkentToday(nowMs = Date.now()): string {
  return new Date(nowMs + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instantni Toshkent sanasiga (YYYY-MM-DD). */
export function instantToTashkentDate(instant: Date): string {
  return new Date(instant.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Toshkent kuni boshlanishi va keyingi kun boshlanishi (to — exclusive). */
export function tashkentDayBounds(dateStr: string): { from: Date; to: Date } {
  const from = new Date(`${dateStr}T00:00:00.000+05:00`);
  return { from, to: new Date(from.getTime() + 24 * 3600 * 1000) };
}

/** Toshkent sanasiga kun qo'shish. */
export function addTashkentDays(dateStr: string, days: number): string {
  const { from } = tashkentDayBounds(dateStr);
  return instantToTashkentDate(new Date(from.getTime() + days * 24 * 3600 * 1000));
}

/** Oy chegaralari. month: YYYY-MM (Toshkent). */
export function tashkentMonthBounds(month?: string): {
  month: string;
  daysInMonth: number;
  from: Date;
  to: Date;
} {
  const m = DATE_RE.test(month?.slice(0, 7) ?? '')
    ? (month as string).slice(0, 7)
    : tashkentToday().slice(0, 7);
  const [y, mo] = m.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const from = new Date(`${m}-01T00:00:00.000+05:00`);
  const nextMonth =
    mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  const to = new Date(`${nextMonth}-01T00:00:00.000+05:00`);
  return { month: m, daysInMonth, from, to };
}

/**
 * Toshkent sanalari oralig'i.
 * `to` — inclusive kun; query uchun `rangeTo` exclusive (keyingi kun 00:00 +05).
 */
export function parseTashkentRange(
  from?: string,
  to?: string,
  defaultSpanDays = 28,
): { from: Date; to: Date; fromStr: string; toStr: string } {
  const toStr = to && DATE_RE.test(to) ? to : tashkentToday();
  const { from: rangeFrom, to: rangeToExclusive } = tashkentDayBounds(toStr);

  let fromStr: string;
  if (from && DATE_RE.test(from)) {
    fromStr = from;
  } else {
    fromStr = addTashkentDays(toStr, -(defaultSpanDays - 1));
  }

  const rangeFromDate = tashkentDayBounds(fromStr).from;
  return {
    from: rangeFromDate,
    to: rangeToExclusive,
    fromStr,
    toStr,
  };
}

/** fromStr dan toStr gacha (ikkala chegarani ham qamrab oladi). */
export function listTashkentDays(fromStr: string, toStr: string): string[] {
  const days: string[] = [];
  let cur = fromStr;
  while (cur <= toStr) {
    days.push(cur);
    cur = addTashkentDays(cur, 1);
  }
  return days;
}

/** BETWEEN uchun inclusive oxirgi instant (Toshkent kuni oxiri). */
export function tashkentDayInclusiveEnd(dateStr: string): Date {
  const { to } = tashkentDayBounds(dateStr);
  return new Date(to.getTime() - 1);
}
