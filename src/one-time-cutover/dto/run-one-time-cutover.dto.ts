import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RunOneTimeCutoverDto {
  @ApiProperty({
    description:
      'ONE_TIME_CUTOVER_TOKEN env dagi maxfiy token (tasodifiy bosilishdan himoya)',
    example: 'cutover-2026-prod-once',
  })
  @IsString()
  @MinLength(8)
  token: string;
}
