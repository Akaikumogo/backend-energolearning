import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum AttemptSource {
  DAILY_PLAN = 'DAILY_PLAN',
  LESSON = 'LESSON',
}

export class SubmitAnswerDto {
  @ApiProperty({ description: 'Savol IDsi' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ description: 'Tanlangan javob varianti IDsi' })
  @IsUUID()
  selectedOptionId: string;

  @ApiPropertyOptional({
    enum: AttemptSource,
    description:
      'DAILY_PLAN = kunlik majburiyat (XP mumkin); LESSON = dars/modul (XP yo‘q). Default: LESSON',
  })
  @IsOptional()
  @IsEnum(AttemptSource)
  source?: AttemptSource;
}
