import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Toshkent Energo' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ description: 'Parent organization id (for substation org)', example: null })
  @IsOptional()
  @IsUUID()
  parentOrganizationId?: string | null;

  @ApiPropertyOptional({ description: 'Marks this organization as default (highest)', example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
