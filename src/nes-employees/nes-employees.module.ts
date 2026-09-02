import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { EmployeeSyncSetting } from '../database/entities/employee-sync-setting.entity';
import { TerminatedEmployee } from '../database/entities/terminated-employee.entity';
import { Department } from '../database/entities/department.entity';
import { Position } from '../database/entities/position.entity';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module';
import { ModeratorPermissionsModule } from '../moderator-permissions/moderator-permissions.module';
import { NesEmployeesController } from './nes-employees.controller';
import { FieldOverridesController } from './field-overrides.controller';
import { NesEmployeesService } from './nes-employees.service';
import { NesSyncGateway } from './nes-sync.gateway';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    OrganizationsModule,
    BranchAnalyticsModule,
    ModeratorPermissionsModule,
    TypeOrmModule.forFeature([
      NesEmployee,
      Organization,
      User,
      UserOrganization,
      EmployeeSyncSetting,
      TerminatedEmployee,
      Department,
      Position,
    ]),
  ],
  controllers: [NesEmployeesController, FieldOverridesController],
  providers: [NesEmployeesService, NesSyncGateway],
})
export class NesEmployeesModule {}
