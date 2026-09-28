import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanCalendarDay } from '../database/entities/plan-calendar-day.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserPlanDayOverride } from '../database/entities/user-plan-day-override.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanCalendarController } from './plan-calendar.controller';
import { PlanCalendarService } from './plan-calendar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanCalendarDay,
      UserPlanDayOverride,
      User,
      UserOrganization,
    ]),
    OrganizationsModule,
  ],
  controllers: [PlanCalendarController],
  providers: [PlanCalendarService],
  exports: [PlanCalendarService],
})
export class PlanCalendarModule {}
