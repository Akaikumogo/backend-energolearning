import { ApiProperty } from '@nestjs/swagger';
import { UserProfileDto } from '../../users/dto/user-profile.dto';

export class LoginDataDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.payload.signature',
  })
  accessToken: string;

  @ApiProperty({
    example:
      'a1b2c3... (refresh token, faqat bir marta ko`rsatiladi, DBda hash saqlanadi)',
  })
  refreshToken: string;

  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}

export class LoginSuccessResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Login muvaffaqiyatli' })
  message: string;

  @ApiProperty({ type: LoginDataDto })
  data: LoginDataDto;
}
