import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class IssueCertificateDto {
  @ApiPropertyOptional({
    description:
      'Qaysi imtihon urinishi uchun. Berilmasa — oxirgi muvaffaqiyatli yakunlangan urinish olinadi.',
  })
  @IsOptional()
  @IsUUID()
  examAttemptId?: string;
}
