import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class EnergoIdExchangeDto {
  @ApiPropertyOptional({ description: 'OAuth authorization code (bir martalik)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  code?: string;

  @ApiPropertyOptional({ description: 'OAuth bir martalik kod (onetime alias)' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  onetime?: string;

  @ApiPropertyOptional({
    description:
      'Authorize paytida ishlatilgan redirect_uri. Berilmasa server defaultini oladi.',
  })
  @IsOptional()
  @IsString()
  redirect_uri?: string;

  @ApiPropertyOptional({
    enum: ['mobile', 'web'],
    description: 'Authorize paytida ishlatilgan client turi',
  })
  @IsOptional()
  @IsString()
  client?: 'mobile' | 'web';
}
