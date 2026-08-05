import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertSafetyRecordDto {
  @IsOptional()
  @IsDateString()
  examDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  examReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  qualificationGroup?: string | null;

  @IsOptional()
  @IsDateString()
  nextExamDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ruleName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  commissionDecision?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  protocolNumber?: string | null;

  @IsOptional()
  @IsDateString()
  protocolDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  doctorConclusion?: string | null;
}

export class RejectSafetyChangeDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}
