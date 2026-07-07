import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLevelDto {
  @ApiProperty({ example: '1-daraja: Elektr xavfsizligi asoslari' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Modul tegishli lavozimlar. Bo`sh bo`lsa — modul barcha xodimlarga ochiq.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  positionIds?: string[];
}
