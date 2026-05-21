import { IsOptional, IsString } from 'class-validator';

export class SyncNesEmployeesDto {
  @IsOptional()
  @IsString()
  date?: string;
}
