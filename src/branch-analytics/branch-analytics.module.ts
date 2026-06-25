import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyPlan } from '../database/entities/daily-plan.entity';
import { Question } from '../database/entities/question.entity';
import { Organization } from '../database/entities/organization.entity';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BranchAnalyticsController } from './branch-analytics.controller';
import { MobileDailyPlanController } from './mobile-daily-plan.controller';
import { BranchAnalyticsService } from './branch-analytics.service';
import { DailyPlanService } from './daily-plan.service';
import { ExportService } from './export.service';

@Module({
  imports: [
    OrganizationsModule,
    TypeOrmModule.forFeature([
      DailyPlan,
      Question,
      Organization,
      User,
      UserOrganization,
      UserQuestionAttempt,
      UserSession,
      NesEmployee,
    ]),
  ],
  controllers: [
    BranchAnalyticsController,
    MobileDailyPlanController,
  ],
  providers: [BranchAnalyticsService, DailyPlanService, ExportService],
  exports: [BranchAnalyticsService, DailyPlanService, ExportService],
})
export class BranchAnalyticsModule {}
