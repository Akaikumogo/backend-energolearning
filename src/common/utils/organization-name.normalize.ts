/** 1C/NES dan kelgan tashkilot nomini saqlash formatiga keltirish. */

const HOLDING_CORE_RE =
  /O[`'ʻʼ]ZBEKISTON\s+MILLIY\s+ELEKTR\s+TARMOQLARI(?:\s+AKSIYADORLIK\s+JAMIYATI)?/iu;

const OPEN_QUOTE = /^["«""„'‘`]/u;
const CLOSE_BY_OPEN: Record<string, string> = {
  '"': '"',
  '«': '»',
  '„': '"',
  '\u201c': '\u201d',
  "'": "'",
  '\u2018': '\u2019',
  '`': '`',
};

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function foldOrgFormToken(token: string): string {
  return token
    .normalize('NFKC')
    .replace(/[^\p{L}]/gu, '')
    .toUpperCase()
    .replace(/А/g, 'A')
    .replace(/О/g, 'O')
    .replace(/Ж/g, 'J');
}

function isOrgFormToken(token: string): boolean {
  const folded = foldOrgFormToken(token);
  return folded === 'AJ' || folded === 'AO';
}

function stripLeadingOrgForms(value: string): string {
  let s = value.trim();
  for (let i = 0; i < 8; i += 1) {
    const match = s.match(/^(\S+)\s+([\s\S]*)$/u);
    if (!match || !isOrgFormToken(match[1] ?? '')) break;
    s = (match[2] ?? '').trim();
  }
  return s;
}

function stripTrailingOrgForms(value: string): string {
  let s = value.trim();
  for (let i = 0; i < 8; i += 1) {
    const match = s.match(/^([\s\S]*?)\s+(\S+)$/u);
    if (!match || !isOrgFormToken(match[2] ?? '')) break;
    s = (match[1] ?? '').trim();
  }
  return s;
}

function stripOuterQuotes(value: string): string {
  const s = value.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function extractQuotedCompany(value: string): { company: string; rest: string } | null {
  const trimmed = value.trim();
  if (!OPEN_QUOTE.test(trimmed)) return null;

  const open = trimmed[0] ?? '';
  const close = CLOSE_BY_OPEN[open] ?? '"';
  let i = 1;
  let company = '';

  while (i < trimmed.length) {
    const ch = trimmed[i] ?? '';
    if (ch === close) {
      return {
        company: company.trim(),
        rest: trimmed.slice(i + 1).trim(),
      };
    }
    company += ch;
    i += 1;
  }

  return null;
}

function cleanBranchText(value: string): string {
  // Faqat qo‘shtirnoqlar; O` / oʻ uchun ishlatiladigan ` va ' saqlanadi
  let branch = value
    .replace(/["«»„\u201c\u201d]/gu, ' ')
    .replace(/,/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  branch = collapseWhitespace(stripLeadingOrgForms(stripTrailingOrgForms(branch)));
  return branch;
}

function normalizeBranchSuffix(value: string): string {
  let branch = cleanBranchText(value);

  const ajPrefix = branch.match(/^AJ(?:,\s*(.*))?$/iu);
  if (ajPrefix) {
    branch = collapseWhitespace(ajPrefix[1] ?? '');
  }

  const aoPrefix = branch.match(/^AO(?:,\s*(.*))?$/iu);
  if (aoPrefix) {
    branch = collapseWhitespace(aoPrefix[1] ?? '');
  }

  branch = branch.replace(/^[,.\s]+/u, '').replace(/[,.\s]+$/u, '').trim();
  branch = collapseWhitespace(branch);

  if (isOrgFormToken(branch)) return '';
  return branch;
}

function formatMetOrganization(company: string, branch?: string): string {
  const core = collapseWhitespace(company);
  if (!core) return '';

  const branchPart = branch ? normalizeBranchSuffix(branch) : '';
  if (branchPart) {
    return `"${core}" AJ, ${branchPart}`;
  }
  return `"${core}" AJ`;
}

function parseLegacyMetName(value: string): string | null {
  const match = value.match(HOLDING_CORE_RE);
  if (!match) return null;

  const holding = match[0].trim();
  const before = value.slice(0, match.index ?? 0);
  const after = value.slice((match.index ?? 0) + holding.length);

  const branch = normalizeBranchSuffix(
    `${before} ${after}`
      .replace(/\b(?:AJ|AO|АJ|АO|АЖ|АО)\.?/giu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );

  return formatMetOrganization(holding, branch || undefined);
}

/**
 * 1C dan kelgan `organization` ni bazaga yozish formatiga keltiradi.
 */
export function normalizeOrganizationName(raw: string | null | undefined): string {
  const input = collapseWhitespace(String(raw ?? '').normalize('NFKC'));
  if (!input) return '';

  const withoutOuter = stripOuterQuotes(input);
  const stripped = stripLeadingOrgForms(withoutOuter);
  const quoted = extractQuotedCompany(stripped);

  if (quoted?.company) {
    const branch = normalizeBranchSuffix(quoted.rest);
    return formatMetOrganization(quoted.company, branch || undefined);
  }

  const alreadyFormatted = stripped.match(
    /^"([^"]+)"\s+AJ(?:,\s*(.+))?$/iu,
  );
  if (alreadyFormatted) {
    const company = (alreadyFormatted[1] ?? '').trim();
    const branch = normalizeBranchSuffix(alreadyFormatted[2] ?? '');
    return formatMetOrganization(company, branch || undefined);
  }

  const aoTail = stripped.match(/^"([^"]+)"\s+AO(?:,\s*(.+))?$/iu);
  if (aoTail) {
    const company = (aoTail[1] ?? '').trim();
    const branch = normalizeBranchSuffix(aoTail[2] ?? '');
    return formatMetOrganization(company, branch || undefined);
  }

  const legacy = parseLegacyMetName(stripped);
  if (legacy) return legacy;

  return collapseWhitespace(stripTrailingOrgForms(stripped.replace(/\bAO\b/giu, 'AJ')));
}

/** Nomlar bir xil tashkilotni ifodalashini tekshiradi (sync/dedup uchun). */
export function organizationNamesEquivalent(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeOrganizationName(a);
  const right = normalizeOrganizationName(b);
  if (!left || !right) return false;
  return left.localeCompare(right, 'uz', { sensitivity: 'accent' }) === 0;
}
