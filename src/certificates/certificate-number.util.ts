const DEFAULT_VERIFY_BASE_URL = 'https://elektrolearn.uzbekistonmet.uz/verify';

/** Bosh tashkilot (markaziy apparat) — jadvalda yo‘q. */
const HEAD_OFFICE_PREFIX = 'MA';

/**
 * MET filiallari — guvohnoma tartib raqamidagi belgi.
 * Izoh: raqam qismiga tabel raqami yoziladi.
 */
const BRANCH_PREFIXES: { prefix: string; patterns: RegExp[] }[] = [
  // Toshkent shahar — oddiy Toshkentdan oldin tekshiriladi
  {
    prefix: 'TSh',
    patterns: [
      /toshkent\s+shahar/i,
      /тошкент\s+шах?ар/i,
      /ташкент\s+(?:город|г\.?)/i,
    ],
  },
  {
    prefix: 'QQ',
    patterns: [
      /qoraqalpog[''‘’]?iston/i,
      /qaraqalpog[''‘’]?iston/i,
      /каракалпакстан/i,
      /қорақалпоғ?истон/i,
    ],
  },
  { prefix: 'AN', patterns: [/andijon/i, /андижан/i, /андижон/i] },
  { prefix: 'BX', patterns: [/buxoro/i, /бухара/i, /бухоро/i] },
  { prefix: 'JX', patterns: [/jizzax/i, /джизак/i, /жиззах/i] },
  {
    prefix: 'QSh',
    patterns: [/qashqadaryo/i, /қашқадар[еёя]/i, /кашкадарь?[еёя]/i],
  },
  { prefix: 'NV', patterns: [/navoiy/i, /навои/i] },
  { prefix: 'NM', patterns: [/namangan/i, /наманган/i] },
  { prefix: 'SM', patterns: [/samarqand/i, /самарканд/i, /самарқанд/i] },
  {
    prefix: 'SR',
    patterns: [/sirdaryo/i, /сырдарь?[еёя]/i, /сирдар[еёя]/i],
  },
  {
    prefix: 'SX',
    patterns: [/surxondaryo/i, /сурхандарь?[еёя]/i, /сурхондар[еёя]/i],
  },
  {
    prefix: 'FR',
    patterns: [/farg[''‘’]?ona/i, /фергана/i, /фарғона/i],
  },
  { prefix: 'XZ', patterns: [/xorazm/i, /хорезм/i, /хоразм/i] },
  // Toshkent viloyati (shahar emas)
  {
    prefix: 'TV',
    patterns: [/toshkent/i, /тошкент/i, /ташкент/i],
  },
];

function normalizeApostrophes(value: string): string {
  return value.replace(/[`´ʻʼ‘’']/g, "'");
}

/**
 * Guvohnoma raqamining prefiksi — MET filial belgilari jadvali bo‘yicha.
 * Masalan: Andijon → AN, Toshkent shahar → TSh, Toshkent → TV.
 * Filial aniqlanmasa yoki Markaziy apparat — MA.
 */
export function resolveCertificatePrefix(
  branchName: string | null | undefined,
): string {
  const raw = normalizeApostrophes((branchName ?? '').trim());
  if (!raw) return HEAD_OFFICE_PREFIX;

  for (const { prefix, patterns } of BRANCH_PREFIXES) {
    if (patterns.some((re) => re.test(raw))) return prefix;
  }

  return HEAD_OFFICE_PREFIX;
}

export function formatCertificateNumber(prefix: string, sequence: number) {
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

/** QR ichiga yoziladigan tekshirish havolasi. */
export function buildVerifyUrl(certificateNumber: string) {
  const base = (
    process.env.CERTIFICATE_VERIFY_URL?.trim() ||
    (process.env.PUBLIC_DOMAIN?.trim()
      ? `${process.env.PUBLIC_DOMAIN.trim().replace(/\/$/, '')}/verify`
      : DEFAULT_VERIFY_BASE_URL)
  ).replace(/\/$/, '');

  return `${base}/${encodeURIComponent(certificateNumber)}`;
}
