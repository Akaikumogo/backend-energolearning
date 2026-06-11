import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'ali.123.met',
    description:
      'Login (1C dan sync qilingan foydalanuvchi uchun) yoki email. Ikkalasi ham qabul qilinadi.',
  })
  @IsOptional()
  @IsString()
  login?: string;

  @ApiPropertyOptional({
    example: 'elektroLearn@admin.com',
    description: 'Email (eski mijozlar uchun). login bilan birga yuborish shart emas.',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    example: '!Qw3rty',
    description: 'Foydalanuvchi paroli',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  password: string;
}
