import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class JoinOrganizationDto {
  @ApiProperty({ description: 'Tashkilot IDsi' })
  @IsUUID()
  organizationId: string;
}
