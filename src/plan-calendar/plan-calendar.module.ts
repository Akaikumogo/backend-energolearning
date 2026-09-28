import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCalendarDay } from '../database/entities/plan-calendar-day.entity';
import { PlanChangeLog } from '../database/entities/plan-change-log.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserPlanDayOverride } from '../database/entities/user-plan-day-override.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import {
  MobilePlanCalendarController,
  PlanCalendarController,
} from './plan-calendar.controller';
import { PlanCalendarService } from './plan-calendar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCalendarDay,
      UserPlanDayOverride,
      PlanChangeLog,
      User,
      UserOrganization,
    ]),
    OrganizationsModule,
  ],
  controllers: [PlanCalendarController, MobilePlanCalendarController],
  providers: [PlanCalendarService],
  exports: [PlanCalendarService],
})
export class PlanCalendarModule {}
