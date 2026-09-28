import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SetPlanCalendarDayDto {
  @ApiPropertyOptional({ nullable: true, description: 'null = standart norma' })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  @Max(200)
  goal?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = hafta kuni bo‘yicha avtomatik' })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsBoolean()
  isDayOff?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  holidayName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class SetUserPlanNormDto {
  @ApiPropertyOptional({ nullable: true, description: 'null = standart (10)' })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  @Max(200)
  goal?: number | null;
}

export class SetUserPlanDayDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  goal: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
