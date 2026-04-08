import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Exam } from '../database/entities/exam.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { ExamQuestion } from '../database/entities/exam-question.entity';
import { ExamQuestionOption } from '../database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from '../database/entities/exam-question-position.entity';
import { ExamQuestionCatalog } from '../database/entities/exam-question-catalog.entity';
import { Position } from '../database/entities/position.entity';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { ExamSchedulerService } from './exam-scheduler.service';

@Module({
  imports: [
    OrganizationsModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Position,
      Exam,
      ExamQuestion,
      ExamQuestionCatalog,
      ExamQuestionOption,
      ExamQuestionPosition,
      ExamAssignment,
      ExamAttempt,
      User,
      UserOrganization,
    ]),
  ],
  controllers: [ExamsController],
  providers: [ExamsService, ExamSchedulerService],
  exports: [ExamsService],
})
export class ExamsModule {}

