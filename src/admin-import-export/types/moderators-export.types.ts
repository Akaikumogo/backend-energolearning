import type { ModeratorPermissions } from '../../database/entities/moderator-permission.entity';

export const MODERATORS_EXPORT_VERSION = 1;

export type ModeratorExportRow = {
  email: string;
  firstName: string;
  lastName: string;
  initialPassword: string | null;
  mustChangePassword: boolean;
  permissions: ModeratorPermissions;
};

export type ModeratorsExportBundle = {
  version: number;
  exportedAt: string;
  moderators: ModeratorExportRow[];
};
