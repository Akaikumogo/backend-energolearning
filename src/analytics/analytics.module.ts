import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { Level } from '../database/entities/level.entity';
import { Question } from '../database/entities/question.entity';
import { UserLevelCompletion } from '../database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from '../database/entities/user-question-attempt.entity';
import { UserSession } from '../database/entities/user-session.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [
    OrganizationsModule,
    TypeOrmModule.forFeature([
      User,
      Organization,
      UserOrganization,
      RefreshToken,
      Level,
      Question,
      UserLevelCompletion,
      UserQuestionAttempt,
      UserSession,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
