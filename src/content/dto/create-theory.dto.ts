import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateTheoryDto {
  @ApiProperty({ example: 'uuid-of-level' })
  @IsUUID()
  levelId: string;

  @ApiPropertyOptional({ example: 'uuid-of-parent-theory' })
  @IsOptional()
  @IsUUID()
  parentTheoryId?: string | null;

  @ApiProperty({ example: 'Tok kuchi va kuchlanish' })
  @IsString()
  @MinLength(1)
  title: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @ApiPropertyOptional({ example: '# Nazariya matni\n\nBu yerda markdown...' })
  @IsOptional()
  @IsString()
  content?: string;
}
