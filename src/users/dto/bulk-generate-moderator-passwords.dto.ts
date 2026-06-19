import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkGenerateModeratorPasswordsDto {
  @ApiProperty({
    type: [String],
    description: 'Paroli qayta generatsiya qilinadigan moderator IDlari',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  userIds: string[];
}
