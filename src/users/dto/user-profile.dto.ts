import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class UserProfileDto {
  @ApiProperty({ example: 'u-1' })
  id: string;

  @ApiProperty({ example: 'elektroLearn@admin.com' })
  email: string;

  @ApiProperty({ example: 'Elektro' })
  firstName: string;

  @ApiProperty({ example: 'Learn' })
  lastName: string;

  @ApiProperty({ enum: Role, example: Role.SUPERADMIN })
  role: Role;

  @ApiProperty({
    required: false,
    example: '/uploads/avatars/u-superadmin-1.png',
  })
  avatarUrl?: string | null;

  @ApiProperty({
    type: [String],
    example: ['org-default', 'org-analytics'],
  })
  organizationIds: string[];

  @ApiProperty({
    description: 'Foydalanuvchi tashkilotlari (id + nom)',
    example: [{ id: 'org-uuid', name: 'Default Organization' }],
  })
  organizations: { id: string; name: string }[];
}
