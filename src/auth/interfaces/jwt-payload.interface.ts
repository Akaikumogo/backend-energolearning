import { Role, AuthMethod } from '../../common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  organizationIds: string[];
  /** Set for OAuth sessions; local password login uses PASSWORD. */
  authMethod?: AuthMethod;
}
