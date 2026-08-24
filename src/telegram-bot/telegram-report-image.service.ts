import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ReportBranchRow = {
  orgName: string;
  percent: number;
  status: 'green' | 'yellow' | 'red';
  completed?: number;
  plan?: number;
  averageMonthlyPercent?: number;
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
  /** Oy kunlari soni (31 / 30 / 28) */
  daysInMonth: number;
  branches: ReportBranchRow[];
  /** Faqat real (bugungacha) kunlar */
  dailyPoints: DailyTrendPoint[];
};

const BLUE = '#2563eb';
const BLUE_SOFT = '#dbeafe';
const BLUE_LINE = '#93c5fd';
const INK = '#0f172a';
const MUTED = '#64748b';
const WHITE = '#ffffff';
const GREEN = '#16a34a';
const YELLOW = '#ca8a04';
const RED = '#dc2626';
const TRACK = '#e2e8f0';

@Injectable()
export class TelegramReportImageService {
  /** @deprecated use buildDailyReportPng + buildMonthlyReportPng */
  async buildCombinedReportPng(
    daily: DailyReportImageInput,
    _monthly: MonthlyReportImageInput,
  ): Promise<Buffer> {
    return this.buildDailyReportPng(daily);
  }

  async buildDailyReportPng(daily: DailyReportImageInput): Promise<Buffer> {
    const svg = this.buildDailySvg(daily);
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  async buildMonthlyReportPng(
    monthly: MonthlyReportImageInput,
  ): Promise<Buffer> {
    const svg = this.buildMonthlySvg(monthly);
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  // ─── Daily ───────────────────────────────────────────────

  private buildDailySvg(daily: DailyReportImageInput): string {
    const width = 1280;
    const pad = 40;
    const headerH = 100;
    const heroH = 140;
    const statsH = 72;
    const rowH = 44;
    const zeroBlockH = 88;
    const maxBranches = 20;

    const sorted = [...daily.branches]
      .sort((a, b) => b.percent - a.percent)
      .slice(0, maxBranches);
    const shortNames = this.shortenOrgNames(sorted.map((b) => b.orgName));
    const submitted = sorted.filter((b) => (b.completed ?? 0) > 0 || b.percent > 0);
    const missing = sorted.filter(
      (b) => (b.completed ?? 0) === 0 && b.percent <= 0,
    );
    const missingNames = this.shortenOrgNames(missing.map((b) => b.orgName));

    const height =
      pad +
      headerH +
      12 +
      heroH +
      12 +
      statsH +
      16 +
      sorted.length * rowH +
      16 +
      (missing.length > 0 ? zeroBlockH : 0) +
      pad;

    const heroY = pad + headerH + 12;
    const statsY = heroY + heroH + 12;
    const listY = statsY + statsH + 16;
    const zeroY = listY + sorted.length * rowH + 16;
    const tableW = width - pad * 2;
    const heroColor = this.statusColor(
      this.statusFromPercent(daily.completionPercent),
    );

    const rows = sorted
      .map((b, i) => {
        const y = listY + i * rowH;
        const bg = i % 2 === 0 ? WHITE : '#f8fbff';
        const name = shortNames[i] ?? this.shortOrgName(b.orgName);
        const pctColor = this.statusColor(b.status);
        const barX = pad + 220;
        const barW = tableW - 220 - 100;
        const fillW = Math.max(0, Math.min(barW, (b.percent / 100) * barW));
        return `
        <rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>
        <text x="${pad + 16}" y="${y + 28}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${i + 1}</text>
        <text x="${pad + 44}" y="${y + 28}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${this.esc(name)}</text>
        <rect x="${barX}" y="${y + 14}" width="${barW}" height="16" rx="8" fill="${TRACK}"/>
        <rect x="${barX}" y="${y + 14}" width="${fillW}" height="16" rx="8" fill="${pctColor}"/>
        <text x="${pad + tableW - 16}" y="${y + 28}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">${this.fmt(b.percent)}%</text>`;
      })
      .join('');

    const zeroBlock =
      missing.length > 0
        ? `
      <rect x="${pad}" y="${zeroY}" width="${tableW}" height="${zeroBlockH - 12}" rx="14" fill="#fef2f2" stroke="${RED}" stroke-width="1.5"/>
      <text x="${pad + 24}" y="${zeroY + 32}" fill="${RED}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">Hisobot topshirmagan filiallar — ${missing.length} ta</text>
      <text x="${pad + 24}" y="${zeroY + 58}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14">${this.esc(missingNames.join(' · ') || '—')}</text>`
        : '';

    const statW = (tableW - 36) / 4;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="20" fill="${WHITE}" stroke="${BLUE}" stroke-width="2.5"/>
  <rect x="18" y="18" width="8" height="${height - 36}" rx="4" fill="${BLUE}"/>

  <rect x="${pad}" y="${pad}" width="${tableW}" height="${headerH - 12}" rx="16" fill="url(#hdr)" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <circle cx="${pad + 36}" cy="${pad + 44}" r="14" fill="${BLUE}"/>
  <text x="${pad + 36}" y="${pad + 49}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">EL</text>
  <text x="${pad + 64}" y="${pad + 38}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">Elektro Learn</text>
  <text x="${pad + 64}" y="${pad + 64}" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">KUNLIK HISOBOT</text>
  <text x="${width - pad - 20}" y="${pad + 38}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Asia/Tashkent · 18:00</text>
  <text x="${width - pad - 20}" y="${pad + 64}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${this.esc(this.dateLabel(daily.planDate))}</text>

  <rect x="${pad}" y="${heroY}" width="${tableW}" height="${heroH}" rx="16" fill="#f8fafc" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <text x="${pad + 32}" y="${heroY + 42}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">BUGUN</text>
  <text x="${pad + 32}" y="${heroY + 108}" fill="${heroColor}" font-family="Segoe UI, Arial, sans-serif" font-size="64" font-weight="800">${this.fmt(daily.completionPercent)}%</text>
  <text x="${pad + tableW - 32}" y="${heroY + 50}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Reja</text>
  <text x="${pad + tableW - 32}" y="${heroY + 88}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="700">${daily.completedTotal} / ${daily.totalPlan}</text>

  ${this.miniStat(pad, statsY, statW, statsH - 8, 'Filiallar', String(daily.branchCount))}
  ${this.miniStat(pad + statW + 12, statsY, statW, statsH - 8, 'Topshirgan', String(submitted.length), GREEN)}
  ${this.miniStat(pad + 2 * (statW + 12), statsY, statW, statsH - 8, 'Topshirmagan', String(missing.length), missing.length ? RED : GREEN)}
  ${this.miniStat(pad + 3 * (statW + 12), statsY, statW, statsH - 8, 'Xodimlar', `${daily.completedEmployees}/${daily.totalEmployees}`)}

  ${rows}
  ${zeroBlock}
</svg>`;
  }

  // ─── Monthly ─────────────────────────────────────────────

  private buildMonthlySvg(monthly: MonthlyReportImageInput): string {
    const width = 1280;
    const pad = 40;
    const headerH = 100;
    const heroH = 120;
    const chartH = 200;
    const rowH = 42;
    const maxBranches = 20;

    const points = monthly.dailyPoints;
    const daysElapsed = points.length;
    const daysInMonth = monthly.daysInMonth || 31;

    const ranked = [...monthly.branches]
      .sort(
        (a, b) =>
          (b.averageMonthlyPercent ?? b.percent) -
          (a.averageMonthlyPercent ?? a.percent),
      )
      .slice(0, maxBranches);
    const shortNames = this.shortenOrgNames(ranked.map((b) => b.orgName));

    const height =
      pad +
      headerH +
      12 +
      heroH +
      16 +
      chartH +
      24 +
      36 +
      ranked.length * rowH +
      pad;

    const heroY = pad + headerH + 12;
    const chartY = heroY + heroH + 16;
    const rankTitleY = chartY + chartH + 24;
    const listY = rankTitleY + 36;
    const tableW = width - pad * 2;
    const heroColor = this.statusColor(
      this.statusFromPercent(monthly.averagePercent),
    );

    const chart = this.buildTrendChart(
      pad,
      chartY,
      tableW,
      chartH,
      points,
    );

    const rows = ranked
      .map((b, i) => {
        const y = listY + i * rowH;
        const bg = i % 2 === 0 ? WHITE : '#f8fbff';
        const name = shortNames[i] ?? this.shortOrgName(b.orgName);
        const pct = b.averageMonthlyPercent ?? b.percent;
        const status = this.statusFromPercent(pct);
        const pctColor = this.statusColor(status);
        const barX = pad + 240;
        const barW = tableW - 240 - 100;
        const fillW = Math.max(0, Math.min(barW, (pct / 100) * barW));
        return `
        <rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>
        <text x="${pad + 16}" y="${y + 27}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${i + 1}</text>
        <text x="${pad + 48}" y="${y + 27}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">${this.esc(name)}</text>
        <rect x="${barX}" y="${y + 13}" width="${barW}" height="16" rx="8" fill="${TRACK}"/>
        <rect x="${barX}" y="${y + 13}" width="${fillW}" height="16" rx="8" fill="${pctColor}"/>
        <text x="${pad + tableW - 16}" y="${y + 27}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">${this.fmt(pct)}%</text>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="hdrM" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="20" fill="${WHITE}" stroke="${BLUE}" stroke-width="2.5"/>
  <rect x="18" y="18" width="8" height="${height - 36}" rx="4" fill="${BLUE}"/>

  <rect x="${pad}" y="${pad}" width="${tableW}" height="${headerH - 12}" rx="16" fill="url(#hdrM)" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <circle cx="${pad + 36}" cy="${pad + 44}" r="14" fill="${BLUE}"/>
  <text x="${pad + 36}" y="${pad + 49}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">EL</text>
  <text x="${pad + 64}" y="${pad + 38}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="800">Elektro Learn</text>
  <text x="${pad + 64}" y="${pad + 64}" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">OYLIK HISOBOT</text>
  <text x="${width - pad - 20}" y="${pad + 38}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Asia/Tashkent</text>
  <text x="${width - pad - 20}" y="${pad + 64}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${this.esc(this.monthLabel(monthly.month))}</text>

  <rect x="${pad}" y="${heroY}" width="${tableW}" height="${heroH}" rx="16" fill="#f8fafc" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <text x="${pad + 32}" y="${heroY + 36}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">OYLIK OʻRTACHA</text>
  <text x="${pad + 32}" y="${heroY + 96}" fill="${heroColor}" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800">${this.fmt(monthly.averagePercent)}%</text>
  <text x="${pad + tableW - 32}" y="${heroY + 50}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Kunlar</text>
  <text x="${pad + tableW - 32}" y="${heroY + 92}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="32" font-weight="700">${daysElapsed} / ${daysInMonth}</text>

  ${chart}

  <text x="${pad}" y="${rankTitleY + 20}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="800">FILIAL REYTINGI</text>
  <text x="${pad + tableW}" y="${rankTitleY + 20}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">OYLIK %</text>

  ${rows}
</svg>`;
  }

  private buildTrendChart(
    x: number,
    y: number,
    w: number,
    h: number,
    points: DailyTrendPoint[],
  ): string {
    const innerPadL = 48;
    const innerPadR = 16;
    const innerPadT = 28;
    const innerPadB = 36;
    const plotX = x + innerPadL;
    const plotY = y + innerPadT;
    const plotW = w - innerPadL - innerPadR;
    const plotH = h - innerPadT - innerPadB;

    if (points.length === 0) {
      return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${WHITE}" stroke="${BLUE_LINE}" stroke-width="1.5"/>
      <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Trend maʼlumoti yoʻq</text>`;
    }

    const maxPct = Math.max(10, ...points.map((p) => p.percent));
    const niceMax = Math.ceil(maxPct / 2) * 2;
    const n = points.length;
    const gap = 2;
    const barW = Math.max(4, (plotW - gap * (n - 1)) / n);

    const bars = points
      .map((p, i) => {
        const bh = Math.max(1, (p.percent / niceMax) * plotH);
        const bx = plotX + i * (barW + gap);
        const by = plotY + plotH - bh;
        const color = this.statusColor(this.statusFromPercent(p.percent));
        return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="2" fill="${color}" opacity="0.85"/>`;
      })
      .join('');

    const yTicks = [0, niceMax / 2, niceMax]
      .map((v) => {
        const ty = plotY + plotH - (v / niceMax) * plotH;
        return `
        <line x1="${plotX}" y1="${ty}" x2="${plotX + plotW}" y2="${ty}" stroke="${BLUE_SOFT}" stroke-width="1"/>
        <text x="${plotX - 8}" y="${ty + 4}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${v}%</text>`;
      })
      .join('');

    const labelIdx = [
      0,
      Math.floor((n - 1) / 2),
      n - 1,
    ].filter((v, i, a) => a.indexOf(v) === i);

    const xLabels = labelIdx
      .map((i) => {
        const p = points[i];
        if (!p) return '';
        const day = p.date.split('-')[2] ?? '';
        const bx = plotX + i * (barW + gap) + barW / 2;
        return `<text x="${bx}" y="${y + h - 12}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${day}</text>`;
      })
      .join('');

    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${WHITE}" stroke="${BLUE_LINE}" stroke-width="1.5"/>
    <text x="${x + 16}" y="${y + 22}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">KUNLIK TREND</text>
    ${yTicks}
    ${bars}
    ${xLabels}`;
  }

  // ─── Helpers ─────────────────────────────────────────────

  private miniStat(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    valueColor = INK,
  ): string {
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${WHITE}" stroke="${BLUE_LINE}" stroke-width="1.5"/>
    <text x="${x + 16}" y="${y + 26}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">${this.esc(label)}</text>
    <text x="${x + 16}" y="${y + 52}" fill="${valueColor}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800">${this.esc(value)}</text>`;
  }

  /** Barcha qatorlar uchun qisqa nomlar (umumiy prefiks ham kesiladi). */
  shortenOrgNames(names: string[]): string[] {
    const cleaned = names.map((n) => this.shortOrgName(n));
    if (cleaned.length < 2) return cleaned;

    const common = this.longestCommonPrefix(cleaned);
    if (common.length < 4) return cleaned;

    return cleaned.map((n) => {
      if (!n.startsWith(common)) return n;
      const rest = n.slice(common.length).replace(/^[\s\-–—,.:]+/, '').trim();
      return rest || n;
    });
  }

  shortOrgName(raw: string): string {
    let s = String(raw || '').trim();
    if (!s) return '—';

    // Boshidagi tashkiliy shakl
    s = s.replace(/^(AJ|AO|MChJ|MCHJ|XK|ЧП|ООО)\s*/i, '');

    // Holding nomi qo'shtirnoq ichida: '...' "..." «...» ʻ...ʼ
    s = s.replace(
      /^(['"«“ʻʼ‘’])([^'"»”ʻʼ‘’]+)\1\s*/u,
      '',
    );
    // Ba'zan ochuvchi/yopuvchi turli belgilar
    s = s.replace(/^['"«“ʻʼ‘’][^'"»”ʻʼ‘’]+['"»”ʻʼ‘’]\s*/u, '');

    // Holding nomi qo'shtirnoqsiz ham uchrashi mumkin
    s = s.replace(
      /^O['ʼʻ`]?ZBEKISTON\s+MILLIY\s+ELEKTR\s+TARMOQLARI\s*/iu,
      '',
    );

    s = s.replace(/^[\s\-–—,.:]+/, '').trim();
    if (!s) return 'Bosh tashkilot';

    // Title-ish: birinchi harf katta (lotin/kirill)
    if (s === s.toUpperCase() && s.length > 3) {
      s = s
        .toLowerCase()
        .replace(/(^|[\s\-])(\S)/g, (_, a, b) => a + String(b).toUpperCase());
    }

    if (s.length > 28) s = `${s.slice(0, 26)}…`;
    return s;
  }

  private longestCommonPrefix(arr: string[]): string {
    if (!arr.length) return '';
    let prefix = arr[0] ?? '';
    for (let i = 1; i < arr.length; i++) {
      const s = arr[i] ?? '';
      let j = 0;
      while (
        j < prefix.length &&
        j < s.length &&
        prefix[j]?.toLowerCase() === s[j]?.toLowerCase()
      ) {
        j++;
      }
      prefix = prefix.slice(0, j);
      if (!prefix) break;
    }
    // So'z chegarasigacha (bo'shliq/tire)
    const m = prefix.match(/^(.+[\s\-–—])/);
    return m ? m[1] : prefix.length >= 8 ? prefix : '';
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
