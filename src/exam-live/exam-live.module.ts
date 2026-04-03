import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { ExamAttemptAnswer } from '../database/entities/exam-attempt-answer.entity';
import { ExamQuestion } from '../database/entities/exam-question.entity';
import { ExamQuestionOption } from '../database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from '../database/entities/exam-question-position.entity';
import { ExamSession } from '../database/entities/exam-session.entity';
import { Exam } from '../database/entities/exam.entity';
import { UserPosition } from '../database/entities/user-position.entity';
import { ExamLiveController } from './exam-live.controller';
import { ExamLiveGateway } from './exam-live.gateway';
import { ExamLiveService } from './exam-live.service';

@Module({
  imports: [
    AuthModule,
    OrganizationsModule,
    TypeOrmModule.forFeature([
      ExamAssignment,
      ExamSession,
      ExamAttempt,
      ExamAttemptAnswer,
      ExamQuestion,
      ExamQuestionOption,
      ExamQuestionPosition,
      UserPosition,
      Exam,
    ]),
  ],
  controllers: [ExamLiveController],
  providers: [ExamLiveService, ExamLiveGateway],
  exports: [ExamLiveService],
})
export class ExamLiveModule {}
