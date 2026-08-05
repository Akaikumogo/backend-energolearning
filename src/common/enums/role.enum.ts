export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  MODERATOR = 'MODERATOR',
  DIRECTOR = 'DIRECTOR',
  USER = 'USER',
}

/**
 * Plan/KPI/Xodimlar ro‘yxati: oddiy xodim + moderator.
 * SUPERADMIN / DIRECTOR hisobga olinmaydi.
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
  return role === Role.MODERATOR || role === Role.DIRECTOR;
}

export type AuthMethod = 'PASSWORD' | 'EID_AGENT';

export const DIRECTOR_EID_ONLY_MESSAGE =
  'Ushbu platformaga faqat EID orqali kirishingiz mumkin.';
