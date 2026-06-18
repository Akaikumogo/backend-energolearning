import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateModeratorPermissionsDto {
  @ApiProperty({
    description: 'Moderator permissions JSON (mergeModeratorPermissions orqali tekshiriladi)',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  permissions: Record<string, unknown>;
}
