import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class RunScriptDto {
  @ApiProperty({
    description:
      'Script fayl nomi (kengaytmasiz yoki .mjs/.js bilan). Misol: seed-parent-org-moderators',
    example: 'seed-parent-org-moderators',
  })
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9_.-]+$/, {
    message: 'script faqat A-Z, a-z, 0-9, _, -, . belgilarini saqlashi mumkin',
  })
  script: string;

  @ApiPropertyOptional({
    description:
      'Skript uchun qo`shimcha environment o`zgaruvchilari. Misol: { "SUPERADMIN_PASSWORD": "..." }',
    example: { SUPERADMIN_PASSWORD: '...' },
  })
  @IsOptional()
  @IsObject()
  env?: Record<string, string>;
}
