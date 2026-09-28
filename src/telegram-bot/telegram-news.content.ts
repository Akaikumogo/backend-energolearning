/**
 * Telegram bot orqali tarqatiladigan yangiliklar.
 * Har bir slayd = bitta rasm (SVG → PNG) + caption (Telegram HTML, ≤ 1024 belgi).
 * Rasmlarda emoji ishlatilmaydi: serverda rangli emoji shrifti yo'q.
 */

export type TelegramNewsSlide = {
  svg: () => string;
  caption: string;
};

export type TelegramNewsItem = {
  key: string;
  title: string;
  description: string;
  slides: TelegramNewsSlide[];
};

const W = 1080;
const H = 1080;
const FONT = 'Segoe UI, DejaVu Sans, Arial, sans-serif';
const BLUE = '#2563eb';
const BLUE_DEEP = '#1e3a8a';
const INK = '#0f172a';
const MUTED = '#64748b';
const GREEN = '#16a34a';
const RED = '#dc2626';
const AMBER = '#f59e0b';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(
  x: number,
  y: number,
  value: string,
  opts: {
    size: number;
    fill?: string;
    weight?: number;
    anchor?: 'start' | 'middle' | 'end';
    opacity?: number;
  },
): string {
  return `<text x="${x}" y="${y}" fill="${opts.fill ?? INK}" font-family="${FONT}" font-size="${opts.size}" font-weight="${opts.weight ?? 400}" text-anchor="${opts.anchor ?? 'start'}"${opts.opacity != null ? ` opacity="${opts.opacity}"` : ''}>${esc(value)}</text>`;
}

function frame(
  index: number,
  total: number,
  titleLines: string[],
  subtitle: string,
  body: string,
): string {
  const titleSvg = titleLines
    .map((line, i) =>
      text(72, 196 + i * 66, line, { size: 56, fill: '#ffffff', weight: 800 }),
    )
    .join('');
  const headerH = 250 + titleLines.length * 66;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${BLUE_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#eef2f7"/>
  <rect x="32" y="32" width="${W - 64}" height="${headerH}" rx="36" fill="url(#hero)"/>
  <circle cx="${W - 120}" cy="110" r="150" fill="#ffffff" opacity="0.06"/>
  <circle cx="${W - 60}" cy="${headerH - 10}" r="90" fill="#ffffff" opacity="0.05"/>
  <rect x="72" y="76" width="390" height="46" rx="23" fill="#ffffff" opacity="0.16"/>
  ${text(96, 108, `ELEKTRO LEARN · YANGILIK ${index}/${total}`, { size: 20, fill: '#ffffff', weight: 700 })}
  ${titleSvg}
  ${text(72, 196 + titleLines.length * 66 + 8, subtitle, { size: 26, fill: '#dbeafe' })}
  <g transform="translate(0, ${headerH + 56})">${body}</g>
  ${text(W / 2, H - 36, 'Elektro Learn ilovasi · Yangiliklar boʻlimida batafsil', { size: 20, fill: MUTED, anchor: 'middle' })}
</svg>`;
}

function card(x: number, y: number, w: number, h: number, fill = '#ffffff'): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="28" fill="${fill}" stroke="#dbe3ee" stroke-width="2"/>`;
}

function stepRow(y: number, n: number, value: string): string {
  return `<circle cx="104" cy="${y}" r="24" fill="${BLUE}"/>
  ${text(104, y + 9, String(n), { size: 24, fill: '#ffffff', weight: 800, anchor: 'middle' })}
  ${text(146, y + 10, value, { size: 28, fill: INK, weight: 600 })}`;
}

function checkMark(cx: number, cy: number): string {
  return `<path d="M ${cx - 12} ${cy} L ${cx - 3} ${cy + 10} L ${cx + 14} ${cy - 10}" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function crossMark(cx: number, cy: number): string {
  return `<path d="M ${cx - 10} ${cy - 10} L ${cx + 10} ${cy + 10} M ${cx + 10} ${cy - 10} L ${cx - 10} ${cy + 10}" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round"/>`;
}

// ─── Slayd 1: kirill alifbosi ─────────────────────────────

function cyrillicSvg(): string {
  const cw = 420;
  const body = `
  ${card(72, 0, cw, 250)}
  ${text(104, 56, 'LOTIN', { size: 22, fill: MUTED, weight: 700 })}
  ${text(104, 118, 'Elektr toki nima?', { size: 34, weight: 700 })}
  ${text(104, 170, 'Toʻgʻri javobni', { size: 26, fill: MUTED })}
  ${text(104, 206, 'tanlang', { size: 26, fill: MUTED })}
  <circle cx="${W / 2}" cy="125" r="34" fill="${AMBER}"/>
  <path d="M ${W / 2 - 14} 125 L ${W / 2 + 12} 125 M ${W / 2 + 2} 113 L ${W / 2 + 14} 125 L ${W / 2 + 2} 137" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${card(W - 72 - cw, 0, cw, 250, '#fffbeb')}
  ${text(W - 72 - cw + 32, 56, 'КИРИЛЛ', { size: 22, fill: '#b45309', weight: 700 })}
  ${text(W - 72 - cw + 32, 118, 'Электр токи нима?', { size: 34, weight: 700 })}
  ${text(W - 72 - cw + 32, 170, 'Тўғри жавобни', { size: 26, fill: MUTED })}
  ${text(W - 72 - cw + 32, 206, 'танланг', { size: 26, fill: MUTED })}
  ${text(72, 330, 'Qanday yoqiladi:', { size: 30, weight: 800 })}
  ${stepRow(392, 1, 'Ilovada Profil sahifasini oching')}
  ${stepRow(460, 2, 'Til boʻlimidan «Ўзбек» ni tanlang')}
  ${stepRow(528, 3, 'Savollar, darslar va javoblar kirillda chiqadi')}
  `;
  return frame(1, 3, ['Ilova endi kirill', 'alifbosida ham'], 'Savollar, darslar va javoblar — oʻzingizga qulay yozuvda', body);
}

// ─── Slayd 2: kalendar plan ───────────────────────────────

function planSvg(): string {
  const labels = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
  const cell = 104;
  const gap = 10;
  const gridW = cell * 7 + gap * 6;
  const x0 = (W - gridW) / 2;
  // 2026-yil oktyabr: 1-oktyabr — payshanba (index 3).
  const firstIdx = 3;
  let cells = '';
  labels.forEach((l, i) => {
    cells += text(x0 + i * (cell + gap) + cell / 2, 26, l, {
      size: 22,
      fill: i >= 5 ? RED : MUTED,
      weight: 700,
      anchor: 'middle',
    });
  });
  for (let d = 1; d <= 18; d++) {
    const idx = firstIdx + d - 1;
    const col = idx % 7;
    const row = Math.floor(idx / 7);
    const x = x0 + col * (cell + gap);
    const y = 44 + row * (68 + gap);
    const off = col >= 5 || d === 1;
    const fill = off ? '#fee2e2' : '#dbeafe';
    const ink = off ? RED : BLUE_DEEP;
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="68" rx="16" fill="${fill}"/>`;
    cells += text(x + 14, y + 28, String(d), { size: 20, fill: ink, weight: 700 });
    cells += text(x + cell - 14, y + 56, off ? '0' : '10', {
      size: 26,
      fill: ink,
      weight: 800,
      anchor: 'end',
    });
  }
  const gridH = 44 + 3 * (68 + gap);
  const ly = gridH + 60;
  const body = `
  ${text(W / 2, 4, 'Oktyabr 2026 (namuna) · 1-oktyabr — bayram', { size: 24, fill: MUTED, weight: 700, anchor: 'middle' })}
  <g transform="translate(0, 28)">${cells}</g>
  <rect x="72" y="${ly}" width="28" height="28" rx="8" fill="#dbeafe"/>
  ${text(114, ly + 23, 'Ish kuni — kuniga 10 ta savol', { size: 26, weight: 600 })}
  <rect x="72" y="${ly + 50}" width="28" height="28" rx="8" fill="#fee2e2"/>
  ${text(114, ly + 73, 'Shanba, yakshanba va bayramlar — plan yoʻq', { size: 26, weight: 600 })}
  ${text(72, ly + 140, 'Planingiz Profil sahifasida kalendar koʻrinishida.', { size: 26, fill: INK })}
  ${text(72, ly + 180, 'Planni faqat markaziy apparat belgilaydi.', { size: 26, fill: MUTED })}
  `;
  return frame(2, 3, ['Kunlik plan endi', 'kalendar asosida'], 'Dam olish va bayram kunlari plan avtomatik 0', body);
}

// ─── Slayd 3: ball yig'ish usuli ──────────────────────────

function pointsSvg(): string {
  const cw = 440;
  const rx = W - 72 - cw;
  let streak = '';
  const r = 30;
  const step = 86;
  const sx = (W - step * 9) / 2;
  for (let i = 0; i < 10; i++) {
    const cx = sx + i * step;
    const cy = 440;
    if (i < 7) {
      streak += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GREEN}"/>${checkMark(cx, cy)}`;
    } else if (i === 7) {
      streak += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${RED}"/>${crossMark(cx, cy)}`;
    } else {
      streak += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#cbd5e1"/>`;
    }
  }
  const body = `
  ${card(72, 0, cw, 290)}
  ${text(104, 54, 'ODDIY KUN', { size: 22, fill: MUTED, weight: 700 })}
  ${text(104, 122, '+10 XP', { size: 64, fill: BLUE, weight: 800 })}
  ${text(104, 176, 'har bir toʻgʻri javob', { size: 26, weight: 600 })}
  ${text(104, 216, 'kunlik plan doirasida', { size: 24, fill: MUTED })}
  ${text(104, 252, '(masalan 10 ta = 100 XP)', { size: 24, fill: MUTED })}
  ${card(rx, 0, cw, 290, '#f0fdf4')}
  ${text(rx + 32, 54, 'PLAN YOʻQ KUN', { size: 22, fill: GREEN, weight: 700 })}
  ${text(rx + 32, 118, '100 XP gacha', { size: 46, fill: GREEN, weight: 800 })}
  ${text(rx + 32, 176, 'ketma-ket toʻgʻri javob', { size: 26, weight: 600 })}
  ${text(rx + 32, 216, 'har biri +10 XP, 10 tagacha', { size: 24, fill: MUTED })}
  ${text(rx + 32, 252, 'birinchi xato — bonus tugaydi', { size: 24, fill: MUTED })}
  ${text(W / 2, 372, 'Misol: 7 ta toʻgʻri, keyin xato', { size: 26, fill: MUTED, weight: 700, anchor: 'middle' })}
  ${streak}
  ${text(W / 2, 530, '7 × 10 = 70 XP', { size: 44, fill: INK, weight: 800, anchor: 'middle' })}
  ${text(W / 2, 580, 'Darslar va plandan tashqari javoblarga ball berilmaydi', { size: 22, fill: MUTED, anchor: 'middle' })}
  `;
  return frame(3, 3, ['Ball yigʻish usuli'], 'XP faqat kunlik plan savollaridan beriladi', body);
}

export const TELEGRAM_NEWS: TelegramNewsItem[] = [
  {
    key: 'updates-2026-09-28',
    title: 'Sentabr yangilanishlari: kirill, kalendar plan, ball yigʻish',
    description:
      '3 ta rasm: kirill alifbosi, kalendar asosidagi kunlik plan, ball (XP) yigʻish usuli.',
    slides: [
      {
        svg: cyrillicSvg,
        caption:
          '🔤 <b>Ilova endi kirill alifbosida ham!</b>\n\n' +
          'Savollar, darslar va javoblar endi kirill yozuvida ham chiqadi.\n\n' +
          '<b>Qanday yoqiladi:</b>\n' +
          '1️⃣ Ilovada <b>Profil</b> sahifasini oching\n' +
          '2️⃣ <b>Til</b> boʻlimidan <b>«Ўзбек»</b> ni tanlang\n' +
          '3️⃣ Tayyor — kontent kirillda chiqadi\n\n' +
          'Lotin yozuviga istalgan vaqtda qaytishingiz mumkin.',
      },
      {
        svg: planSvg,
        caption:
          '📅 <b>Kunlik plan endi kalendar asosida</b>\n\n' +
          '• Ish kunlari — kuniga <b>10 ta</b> savol\n' +
          '• <b>Shanba, yakshanba</b> va <b>bayram</b> kunlari — plan yoʻq\n' +
          '  (masalan, 1-oktyabr — Oʻqituvchi va murabbiylar kuni)\n\n' +
          '👤 Oʻz planingizni ilovadagi <b>Profil</b> sahifasida kalendar koʻrinishida koʻrasiz.\n' +
          '🔒 Planni faqat markaziy apparat belgilaydi.',
      },
      {
        svg: pointsSvg,
        caption:
          '⭐ <b>Ball (XP) yigʻish usuli</b>\n\n' +
          '<b>Oddiy kun:</b> kunlik plandagi har bir toʻgʻri javob — <b>+10 XP</b> ' +
          '(plan soni doirasida, masalan 10 ta = 100 XP).\n\n' +
          '<b>Plan yoʻq kun</b> (dam olish, bayram): «Qoʻshimcha XP oling» — ' +
          'ketma-ket toʻgʻri javoblar uchun har biri <b>+10 XP</b>, 10 tagacha (<b>100 XP</b>).\n' +
          '❗ Birinchi xato javobda bonus tugaydi.\n' +
          'Misol: 7 ta toʻgʻri, keyin xato = <b>70 XP</b>.\n\n' +
          'Darslar va plandan tashqari javoblarga ball berilmaydi.',
      },
    ],
  },
];

export function findTelegramNews(key: string): TelegramNewsItem | undefined {
  return TELEGRAM_NEWS.find((n) => n.key === key);
}
