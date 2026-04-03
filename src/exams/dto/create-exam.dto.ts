import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ExamType } from '../../common/enums/exam-type.enum';

export class CreateExamDto {
  @ApiProperty({ example: 'Navbatdagi imtihon' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: 'Har 6 oyda' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ExamType, example: ExamType.SCHEDULED })
  @IsEnum(ExamType)
  examType: ExamType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Praktik test' })
  @IsOptional()
  @IsBoolean()
  includesPt?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Nazariy bilim' })
  @IsOptional()
  @IsBoolean()
  includesTb?: boolean;
}

