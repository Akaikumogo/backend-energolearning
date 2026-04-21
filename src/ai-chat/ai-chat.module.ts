import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmployeeCertificate } from '../database/entities/employee-certificate.entity';
import { EmployeeCheck } from '../database/entities/employee-check.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { Level } from '../database/entities/level.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { Theory } from '../database/entities/theory.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { AiChatGateway } from './ai-chat.gateway';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([
      User,
      Level,
      Theory,
      Question,
      QuestionOption,
      UserQuestionAttempt,
      UserLevelCompletion,
      ExamAssignment,
      EmployeeCertificate,
      EmployeeCheck,
    ]),
  ],
  providers: [AiChatService, AiChatGateway],
})
export class AiChatModule {}
