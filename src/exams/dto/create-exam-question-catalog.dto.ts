import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ExamQuestionSection } from '../../common/enums/exam-question-section.enum';

export class CreateExamQuestionCatalogDto {
  @ApiProperty({ example: 'PT — maxsus' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({ enum: ExamQuestionSection })
  @IsEnum(ExamQuestionSection)
  section: ExamQuestionSection;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}
