import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateModeratorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Yangi parol (ixtiyoriy)' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string | null;
}
