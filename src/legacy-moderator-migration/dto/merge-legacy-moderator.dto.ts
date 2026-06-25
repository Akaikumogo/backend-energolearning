import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class MergeLegacyModeratorDto {
  @ApiProperty({ description: 'Eski local moderator (energo_id yo`q)' })
  @IsUUID()
  sourceUserId: string;

  @ApiProperty({ description: 'Energo ID xodimi (energo_id bor)' })
  @IsUUID()
  targetUserId: string;

  @ApiPropertyOptional({
    enum: ['prefer-source', 'prefer-target', 'union'],
    default: 'prefer-source',
    description: 'moderator_permissions birlashtirish usuli',
  })
  @IsOptional()
  @IsIn(['prefer-source', 'prefer-target', 'union'])
  permissionMerge?: 'prefer-source' | 'prefer-target' | 'union';

  @ApiPropertyOptional({
    default: false,
    description: 'true bo`lsa faqat hisobot, DB o`zgarmaydi',
  })
  @IsOptional()
  dryRun?: boolean;
}
