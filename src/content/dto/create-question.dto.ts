import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '../../common/enums/question-type.enum';

export class CreateOptionDto {
  @ApiProperty({ example: 'Tok kuchi — amperda o`lchanadi' })
  @IsString()
  @MinLength(1)
  optionText: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  isCorrect: boolean;

  @ApiPropertyOptional({ example: '6 oy' })
  @IsOptional()
  @IsString()
  matchText?: string;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'uuid-of-level' })
  @IsUUID()
  levelId: string;

  @ApiProperty({ example: 'uuid-of-theory' })
  @IsUUID()
  theoryId: string;

  @ApiProperty({ example: 'Tok kuchi nima bilan o`lchanadi?' })
  @IsString()
  @MinLength(1)
  prompt: string;

  @ApiPropertyOptional({ enum: QuestionType, example: QuestionType.SINGLE_CHOICE })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [CreateOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOptionDto)
  options: CreateOptionDto[];
}
