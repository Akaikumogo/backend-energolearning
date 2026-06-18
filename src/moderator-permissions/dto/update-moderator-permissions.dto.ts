import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  MODERATOR_PERMISSION_KEYS,
  mergeModeratorPermissions,
  type CrudPermissions,
  type ModeratorPermissions,
} from '../../database/entities/moderator-permission.entity';

const CRUD_FIELDS: (keyof CrudPermissions)[] = [
  'view',
  'create',
  'update',
  'delete',
];

function sanitizePermissionsInput(
  value: unknown,
): ModeratorPermissions | unknown {
  if (!value || typeof value !== 'object') return value;
  const raw = value as Record<string, unknown>;
  const out = {} as ModeratorPermissions;

  for (const key of MODERATOR_PERMISSION_KEYS) {
    const module = raw[key];
    if (!module || typeof module !== 'object') continue;
    const moduleRaw = module as Record<string, unknown>;
    const crud = {} as CrudPermissions;
    for (const field of CRUD_FIELDS) {
      crud[field] = moduleRaw[field] === true;
    }
    out[key] = crud;
  }

  return mergeModeratorPermissions(out);
}

class CrudDto {
  @ApiProperty()
  @IsBoolean()
  view: boolean;

  @ApiProperty()
  @IsBoolean()
  create: boolean;

  @ApiProperty()
  @IsBoolean()
  update: boolean;

  @ApiProperty()
  @IsBoolean()
  delete: boolean;
}

export class ModeratorPermissionsDto {
  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  contentLevels: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  contentTheories: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  contentQuestions: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  organizations: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  students: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  users: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  moderators: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  profile: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  exams: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  audioLibrary: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  analytics: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  permissions: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  violations: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  logs: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  nesSync: CrudDto;

  @ApiProperty({ type: CrudDto })
  @ValidateNested()
  @Type(() => CrudDto)
  aiAssistant: CrudDto;
}

export class UpdateModeratorPermissionsDto {
  @ApiProperty({ type: ModeratorPermissionsDto })
  @Transform(({ value }) => sanitizePermissionsInput(value))
  @ValidateNested()
  @Type(() => ModeratorPermissionsDto)
  permissions: ModeratorPermissionsDto;
}
