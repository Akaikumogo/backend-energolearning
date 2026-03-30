import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty({ description: 'Savol IDsi' })
  @IsUUID()
  questionId: string;

  @ApiProperty({ description: 'Tanlangan javob varianti IDsi' })
  @IsUUID()
  selectedOptionId: string;
}
