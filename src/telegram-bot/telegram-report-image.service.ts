import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ReportBranchRow = {
  orgName: string;
  percent: number;
  status: 'green' | 'yellow' | 'red';
  completed?: number;
  plan?: number;
  averageMonthlyPercent?: number;
  orgId?: string;
  /** Oylik card: kunlik foizlar (1..N), kelajak kunlar 0 */
  dailyPercents?: number[];
};

export type DailyTrendPoint = {
  date: string;
  percent: number;
  completed?: number;
  plan?: number;
};

export type DailyReportImageInput = {
  planDate: string;
  completionPercent: number;
  completedTotal: number;
  totalPlan: number;
  totalEmployees: number;
  completedEmployees: number;
  extraCorrectTotal: number;
  branchCount: number;
  branches: ReportBranchRow[];
};

export type MonthlyReportImageInput = {
  month: string;
  averagePercent: number;
  branchCount: number;
  daysInMonth: number;
  branches: ReportBranchRow[];
  dailyPoints: DailyTrendPoint[];
};

const BLUE = '#2563eb';
const BLUE_DEEP = '#1d4ed8';
const INK = '#0f172a';
const MUTED = '#64748b';
const WHITE = '#ffffff';
const GREEN = '#16a34a';
const YELLOW = '#ca8a04';
const RED = '#dc2626';
const TRACK = '#e2e8f0';
const BG = '#eef2f7';

@Injectable()
export class TelegramReportImageService {
  /** @deprecated */
  async buildCombinedReportPng(
    daily: DailyReportImageInput,
    _monthly: MonthlyReportImageInput,
  ): Promise<Buffer> {
    return this.buildDailyReportPng(daily);
  }

  async buildDailyReportPng(daily: DailyReportImageInput): Promise<Buffer> {
    return sharp(Buffer.from(this.buildDailySvg(daily))).png().toBuffer();
  }

  async buildMonthlyReportPng(
    monthly: MonthlyReportImageInput,
  ): Promise<Buffer> {
    return sharp(Buffer.from(this.buildMonthlySvg(monthly))).png().toBuffer();
  }

  // ─── Daily: faqat cardlar ────────────────────────────────

  private buildDailySvg(daily: DailyReportImageInput): string {
    const width = 1080;
    const pad = 28;
    const contentW = width - pad * 2;

    const sorted = [...daily.branches].sort((a, b) => b.percent - a.percent);
    const names = sorted.map((b) => this.displayOrgName(b.orgName));
    const submitted = sorted.filter(
      (b) => (b.completed ?? 0) > 0 || b.percent > 0,
    ).length;
    const missing = sorted.length - submitted;

    const heroH = 160;
    const statsH = 84;
    const cols = 2;
    const gap = 12;
    const cardH = 110;
    const rows = Math.ceil(sorted.length / cols);
    const gridH = rows > 0 ? rows * cardH + (rows - 1) * gap : 0;

    const height = pad + heroH + 14 + statsH + 16 + gridH + pad;
    const cardW = (contentW - gap) / cols;

    let y = pad;
    const hero = this.heroBlock(
      pad,
      y,
      contentW,
      heroH,
      'Elektro Learn · Kunlik hisobot',
      `${this.dateLabel(daily.planDate)} · Asia/Tashkent 18:00`,
      `${this.fmt(daily.completionPercent)}%`,
      'Reja',
      `${daily.completedTotal}/${daily.totalPlan}`,
    );
    y += heroH + 14;

    const sw = (contentW - 36) / 4;
    const stats = [
      this.statPill(pad, y, sw, statsH, 'Filiallar', String(daily.branchCount), INK, '#eff6ff'),
      this.statPill(pad + sw + 12, y, sw, statsH, 'Topshirgan', String(submitted), GREEN, '#ecfdf5'),
      this.statPill(pad + 2 * (sw + 12), y, sw, statsH, 'Topshirmagan', String(missing), missing ? RED : GREEN, missing ? '#fef2f2' : '#ecfdf5'),
      this.statPill(pad + 3 * (sw + 12), y, sw, statsH, 'Xodimlar', `${daily.completedEmployees}/${daily.totalEmployees}`, INK, '#f8fafc'),
    ].join('');
    y += statsH + 16;

    const cards = sorted
      .map((b, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = pad + col * (cardW + gap);
        const cy = y + row * (cardH + gap);
        return this.branchCard(
          cx,
          cy,
          cardW,
          cardH,
          names[i] ?? '—',
          b.percent,
          b.status,
          `${b.completed ?? 0}/${b.plan ?? 0}`,
        );
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${this.defs('d')}
  <rect width="100%" height="100%" fill="${BG}"/>
  ${hero}
  ${stats}
  ${cards}
</svg>`;
  }

  // ─── Monthly: cardlar + 31 kunlik chiziq ──────────────────

  private buildMonthlySvg(monthly: MonthlyReportImageInput): string {
    const width = 1080;
    const pad = 28;
    const contentW = width - pad * 2;
    const daysInMonth = monthly.daysInMonth || 31;

    const ranked = [...monthly.branches].sort(
      (a, b) =>
        (b.averageMonthlyPercent ?? b.percent) -
        (a.averageMonthlyPercent ?? a.percent),
    );
    const names = ranked.map((b) => this.displayOrgName(b.orgName));

    const heroH = 150;
    const cols = 2;
    const gap = 12;
    const cardH = 148;
    const rows = Math.ceil(ranked.length / cols);
    const gridH = rows > 0 ? rows * cardH + (rows - 1) * gap : 0;
    const height = pad + heroH + 16 + gridH + pad;
    const cardW = (contentW - gap) / cols;

    let y = pad;
    const hero = this.heroBlock(
      pad,
      y,
      contentW,
      heroH,
      'Elektro Learn · Oylik hisobot',
      `${this.monthLabel(monthly.month)} · Asia/Tashkent`,
      `${this.fmt(monthly.averagePercent)}%`,
      'Kunlar',
      `${monthly.dailyPoints.length}/${daysInMonth}`,
    );
    y += heroH + 16;

    const cards = ranked
      .map((b, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = pad + col * (cardW + gap);
        const cy = y + row * (cardH + gap);
        const pct = b.averageMonthlyPercent ?? b.percent;
        const series = this.padDailySeries(
          b.dailyPercents ?? [],
          daysInMonth,
        );
        return this.branchCardWithSpark(
          cx,
          cy,
          cardW,
          cardH,
          names[i] ?? '—',
          pct,
          this.statusFromPercent(pct),
          series,
        );
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${this.defs('m')}
  <rect width="100%" height="100%" fill="${BG}"/>
  ${hero}
  ${cards}
</svg>`;
  }

  private padDailySeries(vals: number[], daysInMonth: number): number[] {
    const out = vals.slice(0, daysInMonth);
    while (out.length < daysInMonth) out.push(-1); // -1 = kelajak / yo'q
    return out;
  }

  private defs(id: string): string {
    return `<defs>
      <linearGradient id="hero${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BLUE}"/>
        <stop offset="100%" stop-color="${BLUE_DEEP}"/>
      </linearGradient>
      <filter id="soft${id}" x="-5%" y="-5%" width="110%" height="120%">
        <feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.10"/>
      </filter>
    </defs>`;
  }

  private heroBlock(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    sub: string,
    big: string,
    sideLabel: string,
    sideValue: string,
  ): string {
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="url(#hero${title.includes('Oylik') ? 'm' : 'd'})" filter="url(#soft${title.includes('Oylik') ? 'm' : 'd'})"/>
    <text x="${x + 32}" y="${y + 40}" fill="#bfdbfe" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${this.esc(title)}</text>
    <text x="${x + 32}" y="${y + 64}" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="13">${this.esc(sub)}</text>
    <text x="${x + 32}" y="${y + 122}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800">${this.esc(big)}</text>
    <rect x="${x + w - 200}" y="${y + 36}" width="168" height="78" rx="18" fill="rgba(255,255,255,0.18)"/>
    <text x="${x + w - 116}" y="${y + 66}" text-anchor="middle" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="12">${this.esc(sideLabel)}</text>
    <text x="${x + w - 116}" y="${y + 96}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700">${this.esc(sideValue)}</text>`;
  }

  private branchCard(
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    percent: number,
    status: 'green' | 'yellow' | 'red',
    planLabel: string,
  ): string {
    const accent = this.statusColor(status);
    const tint =
      status === 'green' ? '#ecfdf5' : status === 'yellow' ? '#fffbeb' : '#fef2f2';
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${tint}" filter="url(#softd)"/>
    <circle cx="${x + 26}" cy="${y + 28}" r="9" fill="${accent}"/>
    <text x="${x + 44}" y="${y + 34}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">${this.esc(name)}</text>
    <text x="${x + 22}" y="${y + 84}" fill="${accent}" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="800">${this.fmt(percent)}%</text>
    <text x="${x + w - 18}" y="${y + 84}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${this.esc(planLabel)}</text>`;
  }

  private branchCardWithSpark(
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    percent: number,
    status: 'green' | 'yellow' | 'red',
    dailyPercents: number[],
  ): string {
    const accent = this.statusColor(status);
    const tint =
      status === 'green' ? '#ecfdf5' : status === 'yellow' ? '#fffbeb' : '#fef2f2';
    const sparkX = x + 18;
    const sparkY = y + 92;
    const sparkW = w - 36;
    const sparkH = 40;
    const n = dailyPercents.length || 31;
    const gap = 1;
    const barW = Math.max(2, (sparkW - gap * (n - 1)) / n);
    const maxPct = Math.max(10, ...dailyPercents.filter((p) => p >= 0));

    const bars = dailyPercents
      .map((p, i) => {
        const bx = sparkX + i * (barW + gap);
        if (p < 0) {
          return `<rect x="${bx}" y="${sparkY + sparkH - 3}" width="${barW}" height="3" rx="1" fill="${TRACK}"/>`;
        }
        const bh = Math.max(2, (p / maxPct) * sparkH);
        const by = sparkY + sparkH - bh;
        const col = this.statusColor(this.statusFromPercent(p));
        return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="1.5" fill="${col}"/>`;
      })
      .join('');

    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${tint}" filter="url(#softm)"/>
    <circle cx="${x + 26}" cy="${y + 26}" r="8" fill="${accent}"/>
    <text x="${x + 42}" y="${y + 32}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${this.esc(name)}</text>
    <text x="${x + w - 18}" y="${y + 34}" text-anchor="end" fill="${accent}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800">${this.fmt(percent)}%</text>
    <text x="${x + 18}" y="${y + 58}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="11">Kunlik foizlar (1–${n})</text>
    ${bars}`;
  }

  private statPill(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    valueColor: string,
    bg: string,
  ): string {
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${bg}"/>
    <text x="${x + 16}" y="${y + 30}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">${this.esc(label)}</text>
    <text x="${x + 16}" y="${y + 58}" fill="${valueColor}" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="800">${this.esc(value)}</text>`;
  }

  /**
   * Toza, o'qiladigan filial nomi.
   * AJ/AO + holding olib tashlanadi; viloyat/tashkilot nomi to'liq saqlanadi.
   */
  displayOrgName(raw: string): string {
    let s = String(raw || '').trim();
    if (!s) return '—';

    s = s.replace(
      /O['ʼʻ`ʹ′]?\s*ZBEKISTON\s+MILLIY\s+ELEKTR\s+TARMOQLARI/gi,
      ' ',
    );
    s = s.replace(/ЎЗБЕКИСТОН\s+МИЛЛИЙ\s+ЭЛЕКТР\s+ТАРМОҚЛАРИ/gi, ' ');
    s = s.replace(/^(AJ|AO|MChJ|MCHJ|XK|ЧП|ООО)\b[\s.]*/i, '');
    s = s.replace(/\b(AJ|AO)\b/gi, ' ');
    s = s.replace(/["«»“”„]+/g, ' ');
    s = s.replace(/^['ʼʻ`ʹ′\s]+|['ʼʻ`ʹ′\s]+$/g, '');
    s = s.replace(/\bELEKTR\s+TARMOQLARI\b/gi, ' ');
    s = s.replace(/\bFILIALI?\b/gi, ' ');
    s = s.replace(/\s+/g, ' ').trim();

    if (!s) return 'Bosh tashkilot';

    const letters = s.replace(/[^a-zA-ZА-Яа-яЁёЎўҚқҒғҲҳ]/g, '');
    if (letters.length > 2 && letters === letters.toUpperCase()) {
      s = s
        .toLowerCase()
        .replace(/(^|[\s\-])(\S)/g, (_, a, b) => a + String(b).toUpperCase());
    }

    // Max ~36 belgi, so'z chegarasida
    if (s.length > 36) {
      const cut = s.slice(0, 36);
      const sp = cut.lastIndexOf(' ');
      s = `${(sp > 20 ? cut.slice(0, sp) : cut).trim()}…`;
    }
    return s;
  }

  private statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 80) return 'green';
    if (p >= 50) return 'yellow';
    return 'red';
  }

  private statusColor(status: 'green' | 'yellow' | 'red'): string {
    if (status === 'green') return GREEN;
    if (status === 'yellow') return YELLOW;
    return RED;
  }

  private dateLabel(iso: string): string {
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y}`;
  }

  private monthLabel(month: string): string {
    const [y, m] = month.split('-');
    return `${m}.${y}`;
  }

  private fmt(n: number): string {
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  private esc(s: string): string {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
