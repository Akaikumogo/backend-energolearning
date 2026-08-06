export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  MODERATOR = 'MODERATOR',
  /** Filial tasdiqlovchi shaxs — moderator kiritgan jadvallarni tasdiqlaydi. */
  APPROVER = 'APPROVER',
  /** Hisob bo‘limi — analitika/hisobotlar + xodim detail (read-only). */
  ACCOUNTING = 'ACCOUNTING',
  USER = 'USER',
}

/**
 * Plan/KPI/Xodimlar ro‘yxati: oddiy xodim + moderator.
 * SUPERADMIN / APPROVER / ACCOUNTING hisobga olinmaydi.
 */
export const REPORTING_ROLES: readonly Role[] = [
  Role.USER,
  Role.MODERATOR,
] as const;

export function isReportingRole(role: Role | string): boolean {
  return role === Role.USER || role === Role.MODERATOR;
}

/** Admin panelda filial bo‘yicha cheklanadigan rollar. */
export function isOrgScopedAdminRole(role: Role | string): boolean {
  return (
    role === Role.MODERATOR ||
    role === Role.APPROVER ||
    role === Role.ACCOUNTING
  );
}

/** Analitika / hisobot / Excel — filial scope qo‘llanadigan rollar. */
export function isAnalyticsOrgScopedRole(role: Role | string): boolean {
  return role === Role.MODERATOR || role === Role.ACCOUNTING;
}

/** Analitika + hisobot endpointlari. */
export const ANALYTICS_ACCESS_ROLES: readonly Role[] = [
  Role.SUPERADMIN,
  Role.MODERATOR,
  Role.ACCOUNTING,
] as const;

export type AuthMethod = 'PASSWORD' | 'EID_AGENT';

export const APPROVER_EID_ONLY_MESSAGE =
  'Ushbu platformaga faqat EID orqali kirishingiz mumkin.';

/** @deprecated use APPROVER_EID_ONLY_MESSAGE */
export const DIRECTOR_EID_ONLY_MESSAGE = APPROVER_EID_ONLY_MESSAGE;
