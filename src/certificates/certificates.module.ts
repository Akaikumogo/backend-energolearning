import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate } from '../database/entities/certificate.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SafetyRecordsModule } from '../safety-records/safety-records.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesMeController } from './certificates-me.controller';
import { CertificatesPublicController } from './certificates-public.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Certificate,
      ExamAttempt,
      NesEmployee,
      Organization,
      User,
    ]),
    OrganizationsModule,
    SafetyRecordsModule,
  ],
  controllers: [
    CertificatesController,
    CertificatesMeController,
    CertificatesPublicController,
  ],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
