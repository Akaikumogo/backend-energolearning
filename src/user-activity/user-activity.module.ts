import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { UserActivityEvent } from '../database/entities/user-activity-event.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { Question } from '../database/entities/question.entity';
import { UserActivityController } from './user-activity.controller';
import { UserActivityService } from './user-activity.service';
import { UserActivityGateway } from './user-activity.gateway';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      User,
      Organization,
      UserOrganization,
      UserSession,
      UserActivityEvent,
      UserQuestionAttempt,
      Question,
    ]),
  ],
  controllers: [UserActivityController],
  providers: [UserActivityService, UserActivityGateway],
  exports: [UserActivityService],
})
export class UserActivityModule {}
