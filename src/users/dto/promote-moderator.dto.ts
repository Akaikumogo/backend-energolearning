import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class PromoteModeratorDto {
  @ApiProperty({ description: 'Mavjud xodim (USER) user id' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ description: 'Moderator filiali (ixtiyoriy)' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
