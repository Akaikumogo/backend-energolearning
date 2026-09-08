import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExecuteElektroCutoverDto {
  @IsString()
  @IsNotEmpty()
  confirmationCode!: string;

  @IsString()
  @IsOptional()
  adminPassword?: string;

  @IsOptional()
  force?: boolean;
}

export class ElektroArchiveQueryDto {
  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  table?: string;
}
