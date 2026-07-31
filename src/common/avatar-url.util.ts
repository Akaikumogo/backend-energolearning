import { resolveEnergoIdBaseUrl } from '../auth/energo-id-env.util';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * DB da saqlangan qiymat:
 * - Energo image UUID
 * - `/images/{uuid}` (Energo path)
 * - `/uploads/...` (eski lokal avatar)
 * - absolyut URL
 *
 * API javobida clientlarga ko‘rsatish uchun URL qaytaradi.
 */
export function resolveStoredAvatarUrl(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (!value) return null;

  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }

  const energoBase = resolveEnergoIdBaseUrl();

  if (UUID_RE.test(value)) {
    return `${energoBase}/images/${value}`;
  }

  if (value.startsWith('/images/')) {
    return `${energoBase}${value}`;
  }

  // Eski lokal yo‘l yoki boshqa relative path — client BACKEND_ORIGIN qo‘shadi.
  return value;
}

export function isEnergoImageId(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const value = stored.trim();
  return UUID_RE.test(value) || value.startsWith('/images/');
}

export function extractImageId(
  stored: string | null | undefined,
): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (UUID_RE.test(value)) return value;
  const match = value.match(
    /\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
  );
  return match?.[1] ?? null;
}
