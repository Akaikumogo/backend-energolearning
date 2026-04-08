import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { EmployeeCheckType } from '../../common/enums/employee-check-type.enum';

export class CreateEmployeeCheckDto {
  @IsEnum(EmployeeCheckType)
  type: EmployeeCheckType;

  @IsDateString()
  checkDate: string;

  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsString()
  grade?: string | null;

  @IsOptional()
  @IsDateString()
  nextCheckDate?: string | null;

  @IsOptional()
  @IsString()
  commissionLeaderSignature?: string | null;

  @IsOptional()
  @IsString()
  qualificationGroup?: string | null;

  @IsOptional()
  @IsString()
  ruleName?: string | null;

  @IsOptional()
  @IsString()
  conclusion?: string | null;

  @IsOptional()
  @IsString()
  doctorConclusion?: string | null;

  @IsOptional()
  @IsString()
  responsibleSignature?: string | null;
}

