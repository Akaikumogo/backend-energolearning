import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
}

