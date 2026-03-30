import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'elektroLearn@admin.com',
    description: 'Foydalanuvchi emaili',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: '!Qw3rty',
    description: 'Foydalanuvchi paroli',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;
}
