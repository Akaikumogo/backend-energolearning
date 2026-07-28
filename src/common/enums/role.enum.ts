export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  MODERATOR = 'MODERATOR',
  USER = 'USER',
}

/**
 * Plan/KPI/Xodimlar ro‘yxati: oddiy xodim + moderator.
 * SUPERADMIN hisobga olinmaydi.
 */
export const REPORTING_ROLES: readonly Role[] = [
  Role.USER,
  Role.MODERATOR,
] as const;

export function isReportingRole(role: Role | string): boolean {
  return role === Role.USER || role === Role.MODERATOR;
}
