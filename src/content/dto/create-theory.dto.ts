import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TheorySlideDto } from './theory-slide.dto';

export class CreateTheoryDto {
  @ApiProperty({ example: 'uuid-of-level' })
  @IsUUID()
  levelId: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent-theory' })
  @IsOptional()
  @IsUUID()
  parentTheoryId?: string | null;

  @ApiProperty({ example: 'Tok kuchi va kuchlanish' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ example: '# Nazariya matni\n\nBu yerda markdown...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ type: [TheorySlideDto], description: 'Slaydlar (Nazariya)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TheorySlideDto)
  slides?: TheorySlideDto[] | null;
}
