import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportSubmission } from '../database/entities/report-submission.entity';
import { Organization } from '../database/entities/organization.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module';
import { ReportSubmissionsController } from './report-submissions.controller';
import { ReportSubmissionsService } from './report-submissions.service';

@Module({
  imports: [
    OrganizationsModule,
    BranchAnalyticsModule,
    TypeOrmModule.forFeature([ReportSubmission, Organization]),
  ],
  controllers: [ReportSubmissionsController],
  providers: [ReportSubmissionsService],
})
export class ReportSubmissionsModule {}
