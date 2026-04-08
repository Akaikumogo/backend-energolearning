import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class TheorySlideDto {
  @ApiProperty()
  @IsString()
  head: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  items: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  warn?: boolean;
}
