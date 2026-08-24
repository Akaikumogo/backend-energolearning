import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeSafetyRecord } from '../database/entities/employee-safety-record.entity';
import { EmployeeSafetyRecordChange } from '../database/entities/employee-safety-record-change.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { SafetyRecordType } from '../database/entities/safety-record-type.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ModeratorPermissionsModule } from '../moderator-permissions/moderator-permissions.module';
import { SafetyRecordsController } from './safety-records.controller';
import { SafetyRecordsService } from './safety-records.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyRecordType,
      EmployeeSafetyRecord,
      EmployeeSafetyRecordChange,
      User,
      NesEmployee,
    ]),
    OrganizationsModule,
    NotificationsModule,
    ModeratorPermissionsModule,
  ],
  controllers: [SafetyRecordsController],
  providers: [SafetyRecordsService],
  exports: [SafetyRecordsService],
})
export class SafetyRecordsModule {}
