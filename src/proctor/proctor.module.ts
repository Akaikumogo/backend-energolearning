import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmployeeSafetyRecord } from '../database/entities/employee-safety-record.entity';
import { Organization } from '../database/entities/organization.entity';
import {
  ProctorAnswer,
  ProctorAttempt,
  ProctorAttemptQuestion,
  ProctorEvent,
  ProctorPolicy,
  ProctorQuestion,
  ProctorQuestionOption,
  ProctorRecording,
  ProctorResult,
  ProctorRoom,
  ProctorRoomModerator,
  ProctorStandard,
  ProctorStandardQuestion,
  ProctorUploadJob,
  ProctorViolation,
} from '../database/entities/proctor.entities';
import { SafetyRecordType } from '../database/entities/safety-record-type.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProctorAdminController, ProctorSessionController } from './proctor.controller';
import { ProctorGate } from './proctor.gate';
import { ProctorGateway } from './proctor.gateway';
import { ProctorService } from './proctor.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      ProctorQuestion,
      ProctorQuestionOption,
      ProctorStandard,
      ProctorStandardQuestion,
      ProctorPolicy,
      ProctorRoom,
      ProctorRoomModerator,
      ProctorAttempt,
      ProctorAttemptQuestion,
      ProctorAnswer,
      ProctorEvent,
      ProctorResult,
      ProctorRecording,
      ProctorUploadJob,
      ProctorViolation,
      EmployeeSafetyRecord,
      SafetyRecordType,
      User,
      Organization,
    ]),
  ],
  controllers: [ProctorAdminController, ProctorSessionController],
  providers: [ProctorService, ProctorGate, ProctorGateway],
  exports: [ProctorGate],
})
export class ProctorModule {}
