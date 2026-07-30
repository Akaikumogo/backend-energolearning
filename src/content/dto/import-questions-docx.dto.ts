import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value === 'true' || value === '1' || value === 'yes';
  }
  return false;
}

export class ImportQuestionsDocxDto {
  @ApiPropertyOptional({ description: 'Modul (level) UUID' })
  @IsUUID()
  levelId: string;

  @ApiPropertyOptional({ description: 'Dars (lesson root theory) UUID' })
  @IsUUID()
  theoryId: string;

  @ApiPropertyOptional({
    description: 'true bo‘lsa faqat parse/preview, bazaga yozilmaydi',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'Kirill matnni lotinga o‘girish (default: true)',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return true;
    return toBool(value);
  })
  @IsBoolean()
  latinize?: boolean;
}
