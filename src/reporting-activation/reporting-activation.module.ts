import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../database/entities/organization.entity';
import { OrganizationDivisionSetting } from '../database/entities/organization-division-setting.entity';
import { ReportingActivationHistory } from '../database/entities/reporting-activation-history.entity';
import { User } from '../database/entities/user.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReportingActivationController } from './reporting-activation.controller';
import { ReportingActivationService } from './reporting-activation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      User,
      OrganizationDivisionSetting,
      ReportingActivationHistory,
    ]),
    OrganizationsModule,
  ],
  controllers: [ReportingActivationController],
  providers: [ReportingActivationService],
  exports: [ReportingActivationService],
})
export class ReportingActivationModule {}
