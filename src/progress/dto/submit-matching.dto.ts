import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttemptSource } from './submit-answer.dto';

class MatchingPairDto {
  @ApiProperty({ description: 'Chap tarafdagi option IDsi (optionText)' })
  @IsUUID()
  leftOptionId: string;

  @ApiProperty({ description: 'O‘ng tarafdagi option IDsi (matchText egasi)' })
  @IsUUID()
  rightOptionId: string;
}

export class SubmitMatchingDto {
  @ApiProperty({ description: 'Savol IDsi' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ type: [MatchingPairDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchingPairDto)
  pairs: MatchingPairDto[];

  @ApiPropertyOptional({
    enum: AttemptSource,
    description:
      'DAILY_PLAN = kunlik majburiyat (XP mumkin); LESSON = dars/modul (XP yo‘q). Default: LESSON',
  })
  @IsOptional()
  @IsEnum(AttemptSource)
  source?: AttemptSource;
}
