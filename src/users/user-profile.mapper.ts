import { User } from '../database/entities/user.entity';
import { UserProfileDto } from './dto/user-profile.dto';
import { resolveStoredAvatarUrl } from '../common/avatar-url.util';

export type UserOrganizationSummary = {
  id: string;
  name: string;
  isDefault: boolean;
};

export function mapUserOrganizations(user: User): UserOrganizationSummary[] {
  const mapped = (user.organizations ?? [])
    .map((uo) => {
      const org = uo.organization;
      if (!org?.id || !org?.name) return null;
      return { id: org.id, name: org.name, isDefault: org.isDefault === true };
    })
    .filter((v): v is UserOrganizationSummary => v !== null);

  const byId = new Map<string, UserOrganizationSummary>();
  for (const item of mapped) byId.set(item.id, item);
  return Array.from(byId.values());
}

export type NesEmployeeInfo = {
  organizationId?: string | null;
  organizationName?: string | null;
  personnelNumber?: string | null;
  post?: string | null;
  middleName?: string | null;
};

export function mapUserToProfile(
  user: User & { nesEmployee?: NesEmployeeInfo | null },
): UserProfileDto & { energoId?: string | null } {
  const organizations = mapUserOrganizations(user);
  const nes = user.nesEmployee;
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatarUrl: resolveStoredAvatarUrl(user.avatarUrl),
    organizationIds: organizations.map((o) => o.id),
    organizations,
    primaryOrganization: nes?.organizationName
      ? {
          id: nes.organizationId || '',
          name: nes.organizationName,
        }
      : null,
    middleName: nes?.middleName || null,
    personnelNumber: nes?.personnelNumber || null,
    post: nes?.post || null,
    mustChangePassword: user.mustChangePassword ?? false,
    energoId: user.energoId ?? null,
  };
}
