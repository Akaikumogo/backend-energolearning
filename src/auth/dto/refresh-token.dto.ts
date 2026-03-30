import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Login vaqtida berilgan refresh token',
    example: 'f7358f... (uzun token)',
  })
  @IsString()
  @MinLength(20)
  refreshToken: string;
}
