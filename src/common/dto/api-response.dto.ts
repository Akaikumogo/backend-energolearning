import { ApiProperty } from '@nestjs/swagger';

export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'OK' })
  message: string;

  @ApiProperty({ required: false })
  data?: T;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({
    required: false,
    example: ['email must be an email', 'password must be a string'],
  })
  errors?: string[];
}
