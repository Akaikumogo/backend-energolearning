import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { User } from '../database/entities/user.entity';
import { UserProgress } from '../database/entities/user-progress.entity';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { HeartsModule } from '../hearts/hearts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Level,
      Theory,
      Question,
      QuestionOption,
      UserLevelCompletion,
      UserQuestionAttempt,
      User,
      UserProgress,
    ]),
    HeartsModule,
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
