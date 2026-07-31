const DEFAULT_VERIFY_BASE_URL = 'https://elektrolearn.uzbekistonmet.uz/verify';

/** Bosh tashkilot (markaziy apparat) — filial emas. */
const HEAD_OFFICE_PREFIX = 'MA';

/**
 * Tashkilotning to'liq nomida takrorlanadigan so'zlar — prefiksga kirmaydi.
 * Faqat filialning o'ziga xos nomi qoladi.
 */
const ORG_STOPWORDS = new Set([
  'ao',
  'aj',
  'oaj',
  'oao',
  'ао',
  'аж',
  'оао',
  "o'zbekiston",
  'ozbekiston',
  'узбекистон',
  'узбекистан',
  'milliy',
  'миллий',
  'национальные',
  'национальная',
  'elektr',
  'электр',
  'электрические',
  'tarmoqlari',
  'тармоклари',
  'тармоқлари',
  'сети',
  'aksiyadorlik',
  'jamiyati',
  'акциядорлик',
  'жамияти',
  'filiali',
  'filial',
  'филиали',
  'филиал',
]);

function normalizeApostrophes(value: string): string {
  return value.replace(/[`´ʻʼ‘’]/g, "'");
}

/** "Shahar" → "SH", "Toshkent" → "T": sh/ch digrafi bitta harf sifatida olinadi. */
function wordInitial(word: string): string {
  const lower = word.toLocaleLowerCase();
  if (lower.startsWith('sh') || lower.startsWith('ch')) {
    return word.slice(0, 2).toLocaleUpperCase();
  }
  return word.slice(0, 1).toLocaleUpperCase();
}

/**
 * Guvohnoma raqamining prefiksi — filial nomining bosh harflari + "F".
 * Masalan: «ENERGO - IT» filiali → EF, Toshkent shahar … filiali → TSHF,
 * Toshkent filiali → TF. Bosh tashkilotning o'zi bo'lsa — MA.
 */
export function resolveCertificatePrefix(
  branchName: string | null | undefined,
): string {
  const raw = normalizeApostrophes((branchName ?? '').trim());
  if (!raw || !/filial|филиал/i.test(raw)) return HEAD_OFFICE_PREFIX;

  const words = raw
    // "ENERGO - IT" — chiziqcha bilan bog'langan nom bitta so'z hisoblanadi
    .replace(/\s*-\s*/g, '-')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !ORG_STOPWORDS.has(word.toLocaleLowerCase()));

  const code = words.map(wordInitial).join('');
  return code ? `${code}F` : HEAD_OFFICE_PREFIX;
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
