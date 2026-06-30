import { User } from '../database/entities/user.entity';
import { UserProfileDto } from './dto/user-profile.dto';

export function mapUserOrganizations(user: User): { id: string; name: string }[] {
  const mapped = (user.organizations ?? [])
    .map((uo) => {
      const org = uo.organization;
      if (!org?.id || !org?.name) return null;
      return { id: org.id, name: org.name };
    })
    .filter((v): v is { id: string; name: string } => v !== null);

  const byId = new Map<string, { id: string; name: string }>();
  for (const item of mapped) byId.set(item.id, item);
  return Array.from(byId.values());
}

export function mapUserToProfile(user: User): UserProfileDto & { energoId?: string | null } {
  const organizations = mapUserOrganizations(user);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    organizationIds: organizations.map((o) => o.id),
    organizations,
    mustChangePassword: user.mustChangePassword ?? false,
    energoId: user.energoId ?? null,
  };
}
