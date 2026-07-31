import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeCertificateDto {
  @ApiPropertyOptional({ description: 'Bekor qilish sababi' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
