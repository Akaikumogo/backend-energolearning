import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateModeratorDto {
  @ApiProperty({ example: 'moderator@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'Str0ng!Pass',
    description:
      'Ixtiyoriy. Yuborilmasa, server avtomat 8 belgi parol generatsiya qiladi.',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'Sardor' })
  @IsString()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Alimov' })
  @IsString()
  @MinLength(1)
  lastName: string;

  @ApiPropertyOptional({ example: 'uuid-of-org' })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
