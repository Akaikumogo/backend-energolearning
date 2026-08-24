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
};

@Injectable()
export class TelegramReportImageService {
  async buildCombinedReportPng(
    daily: DailyReportImageInput,
    monthly: MonthlyReportImageInput,
  ): Promise<Buffer> {
    const svg = this.buildSvg(daily, monthly);
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private buildSvg(
    daily: DailyReportImageInput,
    monthly: MonthlyReportImageInput,
  ): string {
    const width = 920;
    const rowH = 44;
    const headerH = 88;
    const summaryH = 168;
    const pad = 28;
    const maxBranches = 12;
    const dailyBranches = daily.branches.slice(0, maxBranches);
    const monthlyBranches = monthly.branches.slice(0, maxBranches);
    const jobsLabelH = 36;
    const sectionGap = 18;
    const height =
      pad +
      headerH +
      summaryH +
      sectionGap +
      jobsLabelH +
      dailyBranches.length * rowH +
      sectionGap +
      jobsLabelH +
      monthlyBranches.length * rowH +
      pad +
      24;

    const dailyJobs = dailyBranches
      .map((b, i) =>
        this.jobRow(
          pad,
          pad + headerH + summaryH + sectionGap + jobsLabelH + i * rowH,
          width - pad * 2,
          rowH,
          b.orgName,
          `${this.fmt(b.percent)}%`,
          b.status,
          b.plan != null && b.completed != null
            ? `${b.completed}/${b.plan}`
            : undefined,
        ),
      )
      .join('');

    const monthlyJobs = monthlyBranches
      .map((b, i) =>
        this.jobRow(
          pad,
          pad +
            headerH +
            summaryH +
            sectionGap +
            jobsLabelH +
            dailyBranches.length * rowH +
            sectionGap +
            jobsLabelH +
            i * rowH,
          width - pad * 2,
          rowH,
          b.orgName,
          `${this.fmt(b.averageMonthlyPercent ?? b.percent)}%`,
          b.status,
        ),
      )
      .join('');

    const dailyY = pad + headerH + summaryH + sectionGap;
    const monthlyY =
      dailyY + jobsLabelH + dailyBranches.length * rowH + sectionGap;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/>
      <stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>

  <!-- Header -->
  <circle cx="48" cy="52" r="7" fill="#3fb950"/>
  <text x="68" y="48" fill="#e6edf3" font-family="Segoe UI, Arial, sans-serif" font-size="20" font-weight="700">Elektro Learn · workflow</text>
  <text x="68" y="72" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="13">daily-report.yml · #${this.esc(daily.planDate)} · Asia/Tashkent</text>
  <text x="${width - 40}" y="58" text-anchor="end" fill="#3fb950" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">success</text>

  <!-- Summary cards -->
  ${this.summaryCard(pad, pad + headerH - 8, (width - pad * 2 - 16) / 2, 140, 'Daily job', daily.planDate, [
    ['Completion', `${this.fmt(daily.completionPercent)}%`],
    ['Plan', `${daily.completedTotal} / ${daily.totalPlan}`],
    ['Employees', `${daily.completedEmployees} / ${daily.totalEmployees}`],
    ['Extra+', String(daily.extraCorrectTotal)],
  ], this.statusFromPercent(daily.completionPercent))}

  ${this.summaryCard(pad + (width - pad * 2 - 16) / 2 + 16, pad + headerH - 8, (width - pad * 2 - 16) / 2, 140, 'Monthly job', monthly.month, [
    ['Avg %', `${this.fmt(monthly.averagePercent)}%`],
    ['Branches', String(monthly.branchCount)],
    ['Period', this.monthLabel(monthly.month)],
    ['Goal', 'daily plan'],
  ], this.statusFromPercent(monthly.averagePercent))}

  <text x="${pad}" y="${dailyY + 22}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">JOBS · TODAY</text>
  ${dailyJobs}

  <text x="${pad}" y="${monthlyY + 22}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">JOBS · THIS MONTH</text>
  ${monthlyJobs}
</svg>`;
  }

  private summaryCard(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    subtitle: string,
    rows: [string, string][],
    status: 'green' | 'yellow' | 'red',
  ): string {
    const color = this.statusColor(status);
    const icon = this.statusIcon(status);
    const lines = rows
      .map(
        ([k, v], i) => `
      <text x="${x + 18}" y="${y + 70 + i * 18}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="12">${this.esc(k)}</text>
      <text x="${x + w - 18}" y="${y + 70 + i * 18}" text-anchor="end" fill="#e6edf3" font-family="Consolas, monospace" font-size="12">${this.esc(v)}</text>`,
      )
      .join('');

    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#161b22" stroke="#30363d"/>
    <circle cx="${x + 28}" cy="${y + 28}" r="8" fill="${color}"/>
    <text x="${x + 28}" y="${y + 32}" text-anchor="middle" fill="#0d1117" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700">${icon}</text>
    <text x="${x + 46}" y="${y + 24}" fill="#e6edf3" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${this.esc(title)}</text>
    <text x="${x + 46}" y="${y + 42}" fill="#8b949e" font-family="Segoe UI, Arial, sans-serif" font-size="12">${this.esc(subtitle)}</text>
    ${lines}`;
  }

  private jobRow(
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
    value: string,
    status: 'green' | 'yellow' | 'red',
    detail?: string,
  ): string {
    const color = this.statusColor(status);
    const label = this.statusLabel(status);
    const icon = this.statusIcon(status);
    const short = name.length > 42 ? `${name.slice(0, 40)}…` : name;
    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h - 6}" rx="8" fill="#161b22" stroke="#21262d"/>
    <circle cx="${x + 22}" cy="${y + (h - 6) / 2}" r="7" fill="${color}"/>
    <text x="${x + 22}" y="${y + (h - 6) / 2 + 4}" text-anchor="middle" fill="#0d1117" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700">${icon}</text>
    <text x="${x + 40}" y="${y + 20}" fill="#e6edf3" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${this.esc(short)}</text>
    <text x="${x + 40}" y="${y + 36}" fill="#8b949e" font-family="Consolas, monospace" font-size="11">${detail ? this.esc(detail) + ' · ' : ''}${label}</text>
    <text x="${x + w - 16}" y="${y + (h - 6) / 2 + 5}" text-anchor="end" fill="${color}" font-family="Consolas, monospace" font-size="14" font-weight="700">${this.esc(value)}</text>`;
  }

  private statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 80) return 'green';
    if (p >= 50) return 'yellow';
    return 'red';
  }

  private statusColor(status: 'green' | 'yellow' | 'red'): string {
    if (status === 'green') return '#3fb950';
    if (status === 'yellow') return '#d29922';
    return '#f85149';
  }

  private statusIcon(status: 'green' | 'yellow' | 'red'): string {
    if (status === 'green') return '✓';
    if (status === 'yellow') return '!';
    return '✗';
  }

  private statusLabel(status: 'green' | 'yellow' | 'red'): string {
    if (status === 'green') return 'success';
    if (status === 'yellow') return 'warning';
    return 'failure';
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
