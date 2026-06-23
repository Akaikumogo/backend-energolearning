import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class EnergoIdExchangeDto {
  @ApiProperty({ description: 'OAuth authorization code (bir martalik)' })
  @IsString()
  @MinLength(8)
  code!: string;

  @ApiPropertyOptional({
    description:
      'Authorize paytida ishlatilgan redirect_uri. Berilmasa server defaultini oladi.',
  })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;
}
