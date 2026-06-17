import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum ActivityRange {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export enum UserGroup {
  EMPLOYEES = 'employees', // role=USER — barcha filial xodimlari (main moderator ko'radi)
  MODERATORS = 'moderators', // role=MODERATOR — boshqa filial moderatorlari
}

export class ActivityQueryDto {
  @ApiPropertyOptional({ enum: ActivityRange, default: ActivityRange.DAY })
  @IsOptional()
  @IsEnum(ActivityRange)
  range?: ActivityRange;

  @ApiPropertyOptional({ enum: UserGroup })
  @IsOptional()
  @IsEnum(UserGroup)
  group?: UserGroup;

  @ApiPropertyOptional({ description: 'Organization UUID yoki "all"' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'ISO date — undan oldin emas' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date — undan keyin emas' })
  @IsOptional()
  @IsString()
  to?: string;
}
