import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../database/entities/user.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { Level } from '../database/entities/level.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserLevelCompletion, UserQuestionAttempt, Level]),
    OrganizationsModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
