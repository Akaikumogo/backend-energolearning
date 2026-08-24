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

  // ─── Daily ───────────────────────────────────────────────

  private buildDailySvg(daily: DailyReportImageInput): string {
    const width = 1080;
    const pad = 28;
    const maxBranches = 17;

    const sorted = [...daily.branches]
      .sort((a, b) => b.percent - a.percent)
      .slice(0, maxBranches);
    const shortNames = this.shortenOrgNames(sorted.map((b) => b.orgName));
    const submitted = sorted.filter(
      (b) => (b.completed ?? 0) > 0 || b.percent > 0,
    );
    const missing = sorted.filter(
      (b) => (b.completed ?? 0) === 0 && b.percent <= 0,
    );
    const missingNames = this.shortenOrgNames(missing.map((b) => b.orgName));

    const heroH = 168;
    const statsH = 88;
    const gridRows = Math.ceil(Math.min(sorted.length, 8) / 2);
    const gridCardH = 92;
    const gridGap = 12;
    const gridH = gridRows * gridCardH + (gridRows - 1) * gridGap;
    const listTitleH = 36;
    const rowH = 40;
    const listBranches = sorted;
    const zeroH = missing.length > 0 ? 78 : 0;

    const contentW = width - pad * 2;
    const height =
      pad +
      heroH +
      14 +
      statsH +
      16 +
      (gridH > 0 ? gridH + 16 : 0) +
      listTitleH +
      listBranches.length * rowH +
      (zeroH ? 14 + zeroH : 0) +
      pad;

    let y = pad;
    const heroColor = this.statusColor(
      this.statusFromPercent(daily.completionPercent),
    );

    // Top 8 as colored cards (2-col), rest only in list — or all in list with cards for first 6
    const gridItems = sorted.slice(0, 8);
    const gridShort = shortNames.slice(0, 8);

    const hero = `
    <defs>
      <linearGradient id="heroG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BLUE}"/>
        <stop offset="100%" stop-color="${BLUE_DEEP}"/>
      </linearGradient>
      <filter id="soft" x="-5%" y="-5%" width="110%" height="120%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12"/>
      </filter>
    </defs>
    <rect x="${pad}" y="${y}" width="${contentW}" height="${heroH}" rx="28" fill="url(#heroG)" filter="url(#soft)"/>
    <text x="${pad + 32}" y="${y + 42}" fill="#bfdbfe" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">Elektro Learn · Kunlik hisobot</text>
    <text x="${pad + 32}" y="${y + 68}" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="13">${this.esc(this.dateLabel(daily.planDate))} · Asia/Tashkent 18:00</text>
    <text x="${pad + 32}" y="${y + 130}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="56" font-weight="800">${this.fmt(daily.completionPercent)}%</text>
    <rect x="${pad + contentW - 220}" y="${y + 28}" width="188" height="72" rx="18" fill="rgba(255,255,255,0.18)"/>
    <text x="${pad + contentW - 126}" y="${y + 54}" text-anchor="middle" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="12">Reja</text>
    <text x="${pad + contentW - 126}" y="${y + 82}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700">${daily.completedTotal}/${daily.totalPlan}</text>
    `;

    y += heroH + 14;
    const sw = (contentW - 36) / 4;
    const stats = [
      this.statPill(pad, y, sw, statsH, 'Filiallar', String(daily.branchCount), INK, '#eff6ff'),
      this.statPill(pad + sw + 12, y, sw, statsH, 'Topshirgan', String(submitted.length), GREEN, '#ecfdf5'),
      this.statPill(pad + 2 * (sw + 12), y, sw, statsH, 'Topshirmagan', String(missing.length), missing.length ? RED : GREEN, missing.length ? '#fef2f2' : '#ecfdf5'),
      this.statPill(pad + 3 * (sw + 12), y, sw, statsH, 'Xodimlar', `${daily.completedEmployees}/${daily.totalEmployees}`, INK, '#f8fafc'),
    ].join('');

    y += statsH + 16;
    let gridSvg = '';
    if (gridItems.length) {
      const cw = (contentW - gridGap) / 2;
      gridSvg = gridItems
        .map((b, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cx = pad + col * (cw + gridGap);
          const cy = y + row * (gridCardH + gridGap);
          const name = gridShort[i] ?? this.shortOrgName(b.orgName);
          const st = b.status;
          const accent = this.statusColor(st);
          const tint =
            st === 'green' ? '#ecfdf5' : st === 'yellow' ? '#fffbeb' : '#fef2f2';
          return `
          <rect x="${cx}" y="${cy}" width="${cw}" height="${gridCardH}" rx="20" fill="${tint}" filter="url(#soft)"/>
          <circle cx="${cx + 28}" cy="${cy + 28}" r="10" fill="${accent}"/>
          <text x="${cx + 48}" y="${cy + 34}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="13" font-weight="600">${this.esc(name)}</text>
          <text x="${cx + 24}" y="${cy + 74}" fill="${accent}" font-family="Segoe UI, Arial, sans-serif" font-size="28" font-weight="800">${this.fmt(b.percent)}%</text>
          <text x="${cx + cw - 20}" y="${cy + 74}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12">${b.completed ?? 0}/${b.plan ?? 0}</text>`;
        })
        .join('');
      y += gridH + 16;
    }

    const listTitle = `
    <text x="${pad}" y="${y + 22}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="800">Filial reytingi</text>`;
    y += listTitleH;

    const rows = listBranches
      .map((b, i) => {
        const ry = y + i * rowH;
        const name = shortNames[i] ?? this.shortOrgName(b.orgName);
        const pctColor = this.statusColor(b.status);
        const barX = pad + 200;
        const barW = contentW - 200 - 90;
        const fillW = Math.max(0, Math.min(barW, (b.percent / 100) * barW));
        return `
        <rect x="${pad}" y="${ry}" width="${contentW}" height="${rowH - 4}" rx="12" fill="${i % 2 === 0 ? WHITE : '#f8fafc'}"/>
        <text x="${pad + 14}" y="${ry + 24}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12">${i + 1}</text>
        <text x="${pad + 36}" y="${ry + 24}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">${this.esc(name)}</text>
        <rect x="${barX}" y="${ry + 12}" width="${barW}" height="12" rx="6" fill="${TRACK}"/>
        <rect x="${barX}" y="${ry + 12}" width="${fillW}" height="12" rx="6" fill="${pctColor}"/>
        <text x="${pad + contentW - 14}" y="${ry + 24}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${this.fmt(b.percent)}%</text>`;
      })
      .join('');

    y += listBranches.length * rowH;
    let zero = '';
    if (missing.length > 0) {
      y += 14;
      zero = `
      <rect x="${pad}" y="${y}" width="${contentW}" height="${zeroH}" rx="20" fill="#fef2f2" stroke="#fecaca" stroke-width="1.5"/>
      <text x="${pad + 22}" y="${y + 32}" fill="${RED}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700">Hisobot topshirmagan — ${missing.length} ta</text>
      <text x="${pad + 22}" y="${y + 56}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="13">${this.esc(missingNames.join(' · '))}</text>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${hero}
  ${stats}
  ${gridSvg}
  ${listTitle}
  ${rows}
  ${zero}
</svg>`;
  }

  // ─── Monthly ─────────────────────────────────────────────

  private buildMonthlySvg(monthly: MonthlyReportImageInput): string {
    const width = 1080;
    const pad = 28;
    const contentW = width - pad * 2;
    const points = monthly.dailyPoints;
    const daysElapsed = points.length;
    const daysInMonth = monthly.daysInMonth || 31;

    const ranked = [...monthly.branches]
      .sort(
        (a, b) =>
          (b.averageMonthlyPercent ?? b.percent) -
          (a.averageMonthlyPercent ?? a.percent),
      )
      .slice(0, 17);
    const shortNames = this.shortenOrgNames(ranked.map((b) => b.orgName));

    const heroH = 160;
    const chartH = 180;
    const rowH = 38;
    const height =
      pad + heroH + 14 + chartH + 20 + 32 + ranked.length * rowH + pad;

    const heroColor = this.statusColor(
      this.statusFromPercent(monthly.averagePercent),
    );

    let y = pad;
    const hero = `
    <defs>
      <linearGradient id="heroM" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${BLUE}"/>
        <stop offset="100%" stop-color="${BLUE_DEEP}"/>
      </linearGradient>
      <filter id="softM" x="-5%" y="-5%" width="110%" height="120%">
        <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0f172a" flood-opacity="0.12"/>
      </filter>
    </defs>
    <rect x="${pad}" y="${y}" width="${contentW}" height="${heroH}" rx="28" fill="url(#heroM)" filter="url(#softM)"/>
    <text x="${pad + 32}" y="${y + 40}" fill="#bfdbfe" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="600">Elektro Learn · Oylik hisobot</text>
    <text x="${pad + 32}" y="${y + 64}" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="13">${this.esc(this.monthLabel(monthly.month))} · Asia/Tashkent</text>
    <text x="${pad + 32}" y="${y + 126}" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800">${this.fmt(monthly.averagePercent)}%</text>
    <rect x="${pad + contentW - 200}" y="${y + 36}" width="168" height="88" rx="18" fill="rgba(255,255,255,0.18)"/>
    <text x="${pad + contentW - 116}" y="${y + 68}" text-anchor="middle" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="12">Kunlar</text>
    <text x="${pad + contentW - 116}" y="${y + 100}" text-anchor="middle" fill="${WHITE}" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="700">${daysElapsed}/${daysInMonth}</text>
    `;
    // note: heroColor unused in blue hero by design (like expense app - white on blue); keep semantic in ranking
    void heroColor;

    y += heroH + 14;
    const chart = this.buildTrendChart(pad, y, contentW, chartH, points);
    y += chartH + 20;

    const title = `<text x="${pad}" y="${y + 20}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="800">Filial reytingi</text>
    <text x="${pad + contentW}" y="${y + 20}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12">OYLIK %</text>`;
    y += 32;

    const rows = ranked
      .map((b, i) => {
        const ry = y + i * rowH;
        const name = shortNames[i] ?? this.shortOrgName(b.orgName);
        const pct = b.averageMonthlyPercent ?? b.percent;
        const pctColor = this.statusColor(this.statusFromPercent(pct));
        const barX = pad + 200;
        const barW = contentW - 200 - 90;
        const fillW = Math.max(0, Math.min(barW, (pct / 100) * barW));
        return `
        <rect x="${pad}" y="${ry}" width="${contentW}" height="${rowH - 4}" rx="12" fill="${i % 2 === 0 ? WHITE : '#f8fafc'}"/>
        <text x="${pad + 14}" y="${ry + 22}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12">${i + 1}</text>
        <text x="${pad + 36}" y="${ry + 22}" fill="${INK}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600">${this.esc(name)}</text>
        <rect x="${barX}" y="${ry + 11}" width="${barW}" height="12" rx="6" fill="${TRACK}"/>
        <rect x="${barX}" y="${ry + 11}" width="${fillW}" height="12" rx="6" fill="${pctColor}"/>
        <text x="${pad + contentW - 14}" y="${ry + 22}" text-anchor="end" fill="${pctColor}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">${this.fmt(pct)}%</text>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${BG}"/>
  ${hero}
  ${chart}
  ${title}
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
    const padL = 44;
    const padR = 16;
    const padT = 36;
    const padB = 32;
    const plotX = x + padL;
    const plotY = y + padT;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    if (!points.length) {
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${WHITE}"/>
      <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="14">Trend yoʻq</text>`;
    }

    const maxPct = Math.max(10, ...points.map((p) => p.percent));
    const niceMax = Math.ceil(maxPct / 2) * 2;
    const n = points.length;
    const gap = 2;
    const barW = Math.max(3, (plotW - gap * (n - 1)) / n);

    const bars = points
      .map((p, i) => {
        const bh = Math.max(1, (p.percent / niceMax) * plotH);
        const bx = plotX + i * (barW + gap);
        const by = plotY + plotH - bh;
        return `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" rx="3" fill="${BLUE}" opacity="0.9"/>`;
      })
      .join('');

    const yTicks = [0, niceMax / 2, niceMax]
      .map((v) => {
        const ty = plotY + plotH - (v / niceMax) * plotH;
        return `<text x="${plotX - 8}" y="${ty + 4}" text-anchor="end" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${v}%</text>
        <line x1="${plotX}" y1="${ty}" x2="${plotX + plotW}" y2="${ty}" stroke="#e2e8f0" stroke-width="1"/>`;
      })
      .join('');

    const labelIdx = [0, Math.floor((n - 1) / 2), n - 1].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
    const xLabels = labelIdx
      .map((i) => {
        const p = points[i];
        if (!p) return '';
        const day = p.date.split('-')[2] ?? '';
        const bx = plotX + i * (barW + gap) + barW / 2;
        return `<text x="${bx}" y="${y + h - 10}" text-anchor="middle" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="11">${day}</text>`;
      })
      .join('');

    return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${WHITE}"/>
    <text x="${x + 20}" y="${y + 26}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="700">KUNLIK TREND</text>
    ${yTicks}${bars}${xLabels}`;
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
    <text x="${x + 18}" y="${y + 32}" fill="${MUTED}" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="600">${this.esc(label)}</text>
    <text x="${x + 18}" y="${y + 62}" fill="${valueColor}" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800">${this.esc(value)}</text>`;
  }

  // ─── Name helpers ────────────────────────────────────────

  shortenOrgNames(names: string[]): string[] {
    const cleaned = names.map((n) => this.shortOrgName(n));
    if (cleaned.length < 2) return cleaned;
    const common = this.longestCommonPrefix(cleaned);
    if (common.length < 4) return cleaned;
    return cleaned.map((n) => {
      if (!n.toLowerCase().startsWith(common.toLowerCase())) return n;
      const rest = n.slice(common.length).replace(/^[\s\-–—,.:]+/, '').trim();
      return rest || n;
    });
  }

  /**
   * AJ "O'ZBEKISTON MILLIY ELEKTR TARMOQLARI" FARG'ONA ...
   * → Farg'ona
   * Apostrof holding ichida bo'lgani uchun oddiy quote-regex ishlamaydi.
   */
  shortOrgName(raw: string): string {
    let s = String(raw || '').trim();
    if (!s) return '—';

    // Holding iborasini butunlay olib tashlash (apostrof/backtick/turli belgilar)
    s = s.replace(
      /O['ʼʻ`ʹ′]?\s*ZBEKISTON\s+MILLIY\s+ELEKTR\s+TARMOQLARI/gi,
      ' ',
    );
    s = s.replace(
      /ЎЗБЕКИСТОН\s+МИЛЛИЙ\s+ЭЛЕКТР\s+ТАРМОҚЛАРИ/gi,
      ' ',
    );

    // Tashkiliy shakl
    s = s.replace(/^(AJ|AO|MChJ|MCHJ|XK|ЧП|ООО)\b[\s.]*/i, '');

    // Qolgan qo'shtirnoqlar (apostrof Farg'ona uchun saqlanadi)
    s = s.replace(/["«»“”„]+/g, ' ');
    s = s.replace(/^['ʼʻ`ʹ′\s]+|['ʼʻ`ʹ′\s]+$/g, '');

    // Takroriy "ELEKTR TARMOQLARI" / "filiali" oxirida
    s = s.replace(/\bELEKTR\s+TARMOQLARI\b/gi, ' ');
    s = s.replace(/\bFILIALI?\b/gi, ' ');
    s = s.replace(/\s+/g, ' ').trim();

    if (!s) return 'Bosh tashkilot';

    // Title case agar hammasi katta
    const letters = s.replace(/[^a-zA-ZА-Яа-яЁёЎўҚқҒғҲҳ]/g, '');
    if (letters.length > 2 && letters === letters.toUpperCase()) {
      s = s
        .toLowerCase()
        .replace(/(^|[\s\-])(\S)/g, (_, a, b) => a + String(b).toUpperCase());
    }

    // Birinchi 2 so'zni olish (viloyat nomi odatda boshida)
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 2) {
      s = parts.slice(0, 2).join(' ');
    }

    if (s.length > 22) s = `${s.slice(0, 20)}…`;
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
