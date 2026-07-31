const DEFAULT_VERIFY_BASE_URL = 'https://elektrolearn.uzbekistonmet.uz/verify';

/**
 * Filial prefiksi — guvohnoma raqamining bosh qismi (masalan "BU0001" dagi "BU").
 * branchCode bo'lsa o'shandan, bo'lmasa filial nomining bosh harflaridan olinadi.
 */
export function resolveCertificatePrefix(
  branchCode: string | null | undefined,
  branchName: string | null | undefined,
): string {
  const fromCode = lettersOnly(branchCode).slice(0, 4);
  if (fromCode.length >= 2) return fromCode;

  const fromName = lettersOnly(branchName).slice(0, 2);
  if (fromName.length >= 2) return fromName;

  return 'UZ';
}

function lettersOnly(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\p{L}]/gu, '').toUpperCase();
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
