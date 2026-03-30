import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Toshkent Energo' })
  @IsString()
  @MinLength(1)
  name: string;
}
