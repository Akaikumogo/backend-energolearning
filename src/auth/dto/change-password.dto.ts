import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Joriy parol',
    example: '***REMOVED***',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @ApiProperty({
    description: 'Yangi parol',
    example: 'NewStr0ng!',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
