/**
 * Energo ID — ikki alohida domen:
 *
 *   cabinetid.uzbekistonmet.uz      → foydalanuvchi portali (login UI, 5175)
 *   cabinetid-api.uzbekistonmet.uz  → platforma backend API (:8081)
 *
 * ElektroLearn SERVER faqat cabinetid-api ga zapros yuboradi.
 * Foydalanuvchi brauzeri OAuth da cabinetid (login sahifasi) ga yo‘naltiriladi.
 */
export const ENERGO_ID_DEFAULT_PORTAL_API_URL =
  'https://cabinetid-api.uzbekistonmet.uz';

/** @deprecated alias */
export const ENERGO_ID_DEFAULT_PORTAL_URL = ENERGO_ID_DEFAULT_PORTAL_API_URL;

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function isInternalEnergoIdUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.port === '8080';
  } catch {
    return /:8080(\/|$)/i.test(url);
  }
}

function isLocalDevUrl(url: string) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}

/**
 * Platforma integratsiyasi uchun Energo ID manzili.
 * ENERGO_ID_PORTAL_BASE_URL > ENERGO_ID_BASE_URL (agar :8080 bo‘lmasa) > default portal.
 * :8080 (local dev bundan mustasno) avtomatik portal URL ga almashtiriladi.
 */
export function resolveEnergoIdBaseUrl(): string {
  const portalExplicit = process.env.ENERGO_ID_PORTAL_BASE_URL?.trim();
  if (portalExplicit) {
    return stripTrailingSlash(portalExplicit);
  }

  const fromEnv = process.env.ENERGO_ID_BASE_URL?.trim() ?? '';
  if (!fromEnv) {
    return ENERGO_ID_DEFAULT_PORTAL_API_URL;
  }

  if (isInternalEnergoIdUrl(fromEnv) && !isLocalDevUrl(fromEnv)) {
    return ENERGO_ID_DEFAULT_PORTAL_API_URL;
  }

  return stripTrailingSlash(fromEnv);
}

export function isEnergoIdPortalUrl(baseUrl: string) {
  if (!baseUrl) return false;
  if (baseUrl === ENERGO_ID_DEFAULT_PORTAL_URL) return true;
  try {
    const { port, hostname } = new URL(baseUrl);
    if (port === '8081') return true;
    if (!port && hostname.includes('cabinetid-api')) return true;
    return false;
  } catch {
    return baseUrl.includes(':8081') || baseUrl.includes('cabinetid-api');
  }
}

export function warnIfLegacyEnergoIdEnv() {
  const raw = process.env.ENERGO_ID_BASE_URL?.trim() ?? '';
  const resolved = resolveEnergoIdBaseUrl();
  if (
    raw &&
    isInternalEnergoIdUrl(raw) &&
    !isLocalDevUrl(raw) &&
    resolved !== stripTrailingSlash(raw)
  ) {
    console.warn(
      `[ElektroLearn] ENERGO_ID_BASE_URL=${raw} — ichki :8080. ` +
        `Portal API ishlatiladi: ${resolved}`,
    );
  }
}
