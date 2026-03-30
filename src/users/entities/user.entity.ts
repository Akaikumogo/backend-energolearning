import { Role } from '../../common/enums/role.enum';

export class UserEntity {
  id: string;
  email: string;
  passwordHash: string | null;
  firstName: string;
  lastName: string;
  role: Role;
  organizationIds: string[];
}
