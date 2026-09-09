import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class SetReportActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

export class SetDivisionReportActiveDto {
  @ApiProperty()
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    description: 'Bo‘lim nomi. Bo‘sh string = Bo‘limsiz',
    example: 'Buxgalteriya',
  })
  @IsString()
  @IsOptional()
  division?: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}

export class SetPositionReportActiveDto {
  @ApiProperty()
  @IsUUID()
  organizationId: string;

  @ApiProperty({
    description: 'Bo‘lim nomi. Bo‘sh string = Bo‘limsiz',
    example: 'Buxgalteriya',
    required: false,
  })
  @IsString()
  @IsOptional()
  division?: string;

  @ApiProperty({
    description: 'Lavozim nomi',
    example: 'Bosh mutaxassis',
  })
  @IsString()
  post: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isActive: boolean;
}
