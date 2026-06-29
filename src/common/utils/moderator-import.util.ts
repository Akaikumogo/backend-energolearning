import * as XLSX from 'xlsx';
import { latinizeSearchText } from './latinize-search.util';

export type ModeratorImportRow = {
  index: number;
  fullName: string;
  login: string;
  password: string;
  organizationName: string;
  email: string;
};

export function parseModeratorImportExcel(buffer: Buffer): ModeratorImportRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: '',
  });

  return rows
    .slice(1)
    .map((row, i) => ({
      index: i + 1,
      fullName: String(row[2] ?? '').trim(),
      login: String(row[3] ?? '')
        .trim()
        .toLowerCase(),
      password: String(row[4] ?? '').trim(),
      organizationName: String(row[5] ?? '').trim(),
      email: String(row[6] ?? row[3] ?? '')
        .trim()
        .toLowerCase(),
    }))
    .filter((row) => row.fullName || row.login);
}

export function parseFullName(fio: string) {
  const parts = fio.trim().split(/\s+/).filter(Boolean);
  return {
    lastName: parts[0] ?? '',
    firstName: parts[1] ?? '',
    middleName: parts.slice(2).join(' '),
  };
}

export function loginSearchHints(login: string) {
  const normalized = login.trim().toLowerCase();
  const local = normalized.split('@')[0] ?? normalized;
  const hints = new Set<string>([normalized, local]);
  const withoutSuffix = local.replace(/\.[a-f0-9]{6,10}$/i, '');
  if (withoutSuffix && withoutSuffix !== local) {
    hints.add(withoutSuffix);
  }
  return [...hints].filter(Boolean);
}

export function normName(value?: string | null) {
  return latinizeSearchText((value ?? '').trim().toLowerCase());
}
