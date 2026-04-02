import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreatePositionDto {
  @ApiProperty({ example: 'Elektrik montyor' })
  @IsString()
  @MinLength(1)
  title: string;
}

