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
  branches: ReportBranchRow[];
  /** Oy ichidagi har kun foizi */
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

@Injectable()
export class TelegramReportImageService {
  /** @deprecated use buildDailyReportPng + buildMonthlyReportPng */
  async buildCombinedReportPng(
    daily: DailyReportImageInput,
    monthly: MonthlyReportImageInput,
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

  private buildDailySvg(daily: DailyReportImageInput): string {
    const width = 1280;
    const pad = 40;
    const headerH = 128;
    const summaryH = 120;
    const tableHeadH = 48;
    const rowH = 48;
    const footerH = 80;
    const maxBranches = 20;
    const branches = daily.branches.slice(0, maxBranches);
    const height =
      pad +
      headerH +
      16 +
      summaryH +
      20 +
      tableHeadH +
      branches.length * rowH +
      footerH +
      pad;

    const tableY = pad + headerH + 16 + summaryH + 20;
    const tableW = width - pad * 2;
    const cols = {
      n: 48,
      name: tableW * 0.48,
      plan: tableW * 0.22,
      pct: tableW * 0.18,
    };

    const rows = branches
      .map((b, i) => {
        const y = tableY + tableHeadH + i * rowH;
        const bg = i % 2 === 0 ? WHITE : '#f8fbff';
        const short =
          b.orgName.length > 48 ? `${b.orgName.slice(0, 46)}…` : b.orgName;
        const plan =
          b.plan != null && b.completed != null
            ? `${b.completed} / ${b.plan}`
            : '—';
        const pctColor = this.statusColor(b.status);
        return `
        <rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>
        <line x1="${pad}" y1="${y + rowH}" x2="${pad + tableW}" y2="${y + rowH}" stroke="${BLUE_SOFT}" stroke-width="1"/>
        <text x="${pad + 18}" y="${y + 27}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${i + 1}</text>
        <text x="${pad + cols.n}" y="${y + 27}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">${this.esc(short)}</text>
        <text x="${pad + cols.n + cols.name}" y="${y + 27}" fill="${MUTED}" font-family="Consolas, monospace" font-size="13">${this.esc(plan)}</text>
        <text x="${pad + tableW - 24}" y="${y + 27}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">${this.fmt(b.percent)}%</text>`;
      })
      .join('');

    const footerY = tableY + tableHeadH + branches.length * rowH;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#eff6ff"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f0f7ff"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="20" fill="${WHITE}" stroke="${BLUE}" stroke-width="2.5"/>
  <rect x="18" y="18" width="8" height="${height - 36}" rx="4" fill="${BLUE}"/>

  <!-- Header -->
  <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${headerH - 12}" rx="16" fill="url(#hdr)" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <circle cx="${pad + 36}" cy="${pad + 48}" r="14" fill="${BLUE}"/>
  <text x="${pad + 36}" y="${pad + 53}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">EL</text>
  <text x="${pad + 64}" y="${pad + 42}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="800">Elektro Learn</text>
  <text x="${pad + 64}" y="${pad + 68}" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">KUNLIK HISOBOT · TABLE</text>
  <text x="${width - pad - 20}" y="${pad + 42}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Asia/Tashkent · 18:00</text>
  <text x="${width - pad - 20}" y="${pad + 68}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${this.esc(this.dateLabel(daily.planDate))}</text>

  <!-- Summary strip -->
  ${this.kpiCard(pad, pad + headerH + 4, (width - pad * 2 - 36) / 4, summaryH - 8, 'Umumiy foiz', `${this.fmt(daily.completionPercent)}%`, BLUE)}
  ${this.kpiCard(pad + (width - pad * 2 - 36) / 4 + 12, pad + headerH + 4, (width - pad * 2 - 36) / 4, summaryH - 8, 'Reja', `${daily.completedTotal} / ${daily.totalPlan}`, INK)}
  ${this.kpiCard(pad + 2 * ((width - pad * 2 - 36) / 4 + 12), pad + headerH + 4, (width - pad * 2 - 36) / 4, summaryH - 8, 'Xodimlar', `${daily.completedEmployees} / ${daily.totalEmployees}`, INK)}
  ${this.kpiCard(pad + 3 * ((width - pad * 2 - 36) / 4 + 12), pad + headerH + 4, (width - pad * 2 - 36) / 4, summaryH - 8, 'Filiallar', String(daily.branchCount), INK)}

  <!-- Table head -->
  <rect x="${pad}" y="${tableY}" width="${tableW}" height="${tableHeadH}" fill="${BLUE}"/>
  <text x="${pad + 18}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">#</text>
  <text x="${pad + cols.n}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">FILIAL</text>
  <text x="${pad + cols.n + cols.name}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">BAJARILDI / REJA</text>
  <text x="${pad + tableW - 24}" y="${tableY + 28}" text-anchor="end" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">FOIZ</text>
  <rect x="${pad}" y="${tableY}" width="${tableW}" height="${tableHeadH + branches.length * rowH}" fill="none" stroke="${BLUE}" stroke-width="1.5" rx="0"/>

  ${rows}

  <!-- Footer overall -->
  <rect x="${pad}" y="${footerY}" width="${tableW}" height="${footerH - 12}" fill="#eff6ff" stroke="${BLUE}" stroke-width="1.5"/>
  <text x="${pad + 24}" y="${footerY + 38}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">YAKUNIY UMUMIY FOIZ</text>
  <text x="${pad + tableW - 24}" y="${footerY + 40}" text-anchor="end" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800">${this.fmt(daily.completionPercent)}%</text>
</svg>`;
  }

  private buildMonthlySvg(monthly: MonthlyReportImageInput): string {
    const width = 1280;
    const pad = 40;
    const headerH = 128;
    const summaryH = 112;
    const tableHeadH = 48;
    const rowH = 42;
    const footerH = 80;
    const points = monthly.dailyPoints.slice(-31);
    const height =
      pad +
      headerH +
      16 +
      summaryH +
      20 +
      tableHeadH +
      Math.max(points.length, 1) * rowH +
      footerH +
      pad +
      24;

    const tableY = pad + headerH + 16 + summaryH + 20;
    const tableW = width - pad * 2;

    const rows = points
      .map((p, i) => {
        const y = tableY + tableHeadH + i * rowH;
        const bg = i % 2 === 0 ? WHITE : '#f8fbff';
        const status = this.statusFromPercent(p.percent);
        const pctColor = this.statusColor(status);
        const dayLabel = this.dateLabel(p.date);
        const plan =
          p.plan != null && p.completed != null
            ? `${p.completed} / ${p.plan}`
            : '—';
        return `
        <rect x="${pad}" y="${y}" width="${tableW}" height="${rowH}" fill="${bg}"/>
        <line x1="${pad}" y1="${y + rowH}" x2="${pad + tableW}" y2="${y + rowH}" stroke="${BLUE_SOFT}" stroke-width="1"/>
        <text x="${pad + 24}" y="${y + 25}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${i + 1}</text>
        <text x="${pad + 70}" y="${y + 25}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">${this.esc(dayLabel)}</text>
        <text x="${pad + 280}" y="${y + 25}" fill="${MUTED}" font-family="Consolas, monospace" font-size="13">${this.esc(plan)}</text>
        <text x="${pad + tableW - 24}" y="${y + 25}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">${this.fmt(p.percent)}%</text>`;
      })
      .join('');

    const emptyRow =
      points.length === 0
        ? `<text x="${width / 2}" y="${tableY + tableHeadH + 28}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Maʼlumot yoʻq</text>`
        : '';

    const footerY = tableY + tableHeadH + Math.max(points.length, 1) * rowH;

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

  <rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${headerH - 12}" rx="16" fill="url(#hdrM)" stroke="${BLUE_LINE}" stroke-width="1.5"/>
  <circle cx="${pad + 36}" cy="${pad + 48}" r="14" fill="${BLUE}"/>
  <text x="${pad + 36}" y="${pad + 53}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">EL</text>
  <text x="${pad + 64}" y="${pad + 42}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="800">Elektro Learn</text>
  <text x="${pad + 64}" y="${pad + 68}" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">OYLIK HISOBOT · KUNLIK FOIZLAR</text>
  <text x="${width - pad - 20}" y="${pad + 42}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13">Asia/Tashkent</text>
  <text x="${width - pad - 20}" y="${pad + 68}" text-anchor="end" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${this.esc(this.monthLabel(monthly.month))}</text>

  ${this.kpiCard(pad, pad + headerH + 4, (width - pad * 2 - 24) / 3, summaryH - 8, 'Oylik oʻrtacha', `${this.fmt(monthly.averagePercent)}%`, BLUE)}
  ${this.kpiCard(pad + (width - pad * 2 - 24) / 3 + 12, pad + headerH + 4, (width - pad * 2 - 24) / 3, summaryH - 8, 'Kunlar', String(points.length), INK)}
  ${this.kpiCard(pad + 2 * ((width - pad * 2 - 24) / 3 + 12), pad + headerH + 4, (width - pad * 2 - 24) / 3, summaryH - 8, 'Filiallar', String(monthly.branchCount), INK)}

  <rect x="${pad}" y="${tableY}" width="${tableW}" height="${tableHeadH}" fill="${BLUE}"/>
  <text x="${pad + 24}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">#</text>
  <text x="${pad + 70}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">SANA</text>
  <text x="${pad + 280}" y="${tableY + 28}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">BAJARILDI / REJA</text>
  <text x="${pad + tableW - 24}" y="${tableY + 28}" text-anchor="end" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="700">KUNLIK FOIZ</text>
  <rect x="${pad}" y="${tableY}" width="${tableW}" height="${tableHeadH + Math.max(points.length, 1) * rowH}" fill="none" stroke="${BLUE}" stroke-width="1.5"/>

  ${rows}
  ${emptyRow}

  <rect x="${pad}" y="${footerY}" width="${tableW}" height="${footerH - 12}" fill="#eff6ff" stroke="${BLUE}" stroke-width="1.5"/>
  <text x="${pad + 24}" y="${footerY + 38}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">OYLIK UMUMIY FOIZ (OʻRTACHA)</text>
  <text x="${pad + tableW - 24}" y="${footerY + 40}" text-anchor="end" fill="${BLUE}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800">${this.fmt(monthly.averagePercent)}%</text>
</svg>`;
  }

  private kpiCard(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    value: string,
    valueColor: string,
  ): string {
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${WHITE}" stroke="${BLUE_LINE}" stroke-width="1.5"/>
    <text x="${x + 20}" y="${y + 36}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${this.esc(label)}</text>
    <text x="${x + 20}" y="${y + 72}" fill="${valueColor}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800">${this.esc(value)}</text>`;
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
