import { createHmac, randomUUID } from 'crypto';

export type ReportIntegrityStatus = 'ok' | 'tampered' | 'unsigned';

export type ReportHashEmployee = {
  email: string;
  daysCompleted: number;
  monthlyPercent: number;
  extraCorrectTotal: number;
  dayLabels: string[];
};

export function getReportIntegritySecret(): string {
  return (
    process.env.REPORT_EXCEL_HMAC_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'elektrolearn-dev-secret'
  );
}

export function newReportExportId(): string {
  return randomUUID();
}

/** Canonical HMAC — Excel qo‘lda o‘zgartirilsa META dagi contentHash bilan mos kelmaydi. */
export function computeReportContentHash(input: {
  orgId: string;
  month: string;
  employees: ReportHashEmployee[];
}): string {
  const canonical = {
    orgId: input.orgId.trim(),
    month: input.month.trim(),
    employees: [...input.employees]
      .map((e) => ({
        email: e.email.trim().toLowerCase(),
        daysCompleted: Number(e.daysCompleted) || 0,
        monthlyPercent: Number(e.monthlyPercent) || 0,
        extraCorrectTotal: Number(e.extraCorrectTotal) || 0,
        dayLabels: (e.dayLabels ?? []).map((l) => String(l ?? '').trim()),
      }))
      .sort((a, b) => a.email.localeCompare(b.email)),
  };

  return createHmac('sha256', getReportIntegritySecret())
    .update(JSON.stringify(canonical))
    .digest('hex');
}

export function verifyReportContentHash(
  expected: string | null | undefined,
  input: {
    orgId: string;
    month: string;
    employees: ReportHashEmployee[];
  },
): { status: ReportIntegrityStatus; computed: string } {
  const computed = computeReportContentHash(input);
  const meta = expected?.trim() || '';
  if (!meta) {
    return { status: 'unsigned', computed };
  }
  if (meta.toLowerCase() === computed.toLowerCase()) {
    return { status: 'ok', computed };
  }
  return { status: 'tampered', computed };
}
