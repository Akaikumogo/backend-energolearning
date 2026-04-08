import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UpsertEmployeeCertificateDto {
  @IsUUID()
  organizationId: string;

  @IsString()
  @IsNotEmpty()
  positionTitle: string;

  @IsString()
  @IsNotEmpty()
  certificateNumber: string;

  @IsString()
  @IsNotEmpty()
  presentedByFullName: string;
}

