import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { QuestionType } from '../../common/enums/question-type.enum';
import { ExamQuestionSection } from '../../common/enums/exam-question-section.enum';
import { ExamQuestionDifficulty } from '../../common/enums/exam-question-difficulty.enum';

export class CreateExamQuestionOptionDto {
  @ApiProperty({ example: 'Ha' })
  @IsString()
  @MinLength(1)
  optionText: string;

  @ApiPropertyOptional({ example: '6 oy' })
  @IsOptional()
  @IsString()
  matchText?: string | null;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  orderIndex?: number;
}

export class CreateExamQuestionDto {
  @ApiProperty({ example: 'Dielektrik qo‘lqop sinov muddati nechchi oy?' })
  @IsString()
  @MinLength(1)
  prompt: string;

  @ApiProperty({ enum: QuestionType, example: QuestionType.SINGLE_CHOICE })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ isArray: true, example: ['safety', 'ppe'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[] | null;

  @ApiPropertyOptional({ enum: ExamQuestionSection, default: ExamQuestionSection.PT })
  @IsOptional()
  @IsEnum(ExamQuestionSection)
  section?: ExamQuestionSection;

  @ApiPropertyOptional({ enum: ExamQuestionDifficulty, default: ExamQuestionDifficulty.MEDIUM })
  @IsOptional()
  @IsEnum(ExamQuestionDifficulty)
  difficulty?: ExamQuestionDifficulty;

  @ApiPropertyOptional({ description: 'Which positions this question applies to', isArray: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  positionIds?: string[];

  @ApiProperty({ type: [CreateExamQuestionOptionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExamQuestionOptionDto)
  options: CreateExamQuestionOptionDto[];
}

