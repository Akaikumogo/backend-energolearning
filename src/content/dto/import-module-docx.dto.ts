import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';

export class ImportModuleDocxDto {
  @ApiPropertyOptional({
    description: 'true bo‘lsa preview, bazaga yozilmaydi',
    default: false,
  })
  @IsOptional()
  dryRun?: boolean | string;

  @ApiPropertyOptional({
    description: 'Kirill matnni lotinga o‘girish',
    default: true,
  })
  @IsOptional()
  latinize?: boolean | string;
}
