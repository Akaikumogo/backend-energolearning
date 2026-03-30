import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './database/entities/user.entity';
import { Organization } from './database/entities/organization.entity';
import { UserOrganization } from './database/entities/user-organization.entity';
import { RefreshToken } from './database/entities/refresh-token.entity';
import { Level } from './database/entities/level.entity';
import { Theory } from './database/entities/theory.entity';
import { Question } from './database/entities/question.entity';
import { QuestionOption } from './database/entities/question-option.entity';
import { UserProgress } from './database/entities/user-progress.entity';
import { UserLevelCompletion } from './database/entities/user-level-completion.entity';
import { UserQuestionAttempt } from './database/entities/user-question-attempt.entity';
import { Certificate } from './database/entities/certificate.entity';
import { AnalyticsModule } from './analytics/analytics.module';
import { UploadModule } from './upload/upload.module';
import { ContentModule } from './content/content.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProgressModule } from './progress/progress.module';
import { StudentsModule } from './students/students.module';
import { SeedModule } from './seed/seed.module';
import 'dotenv/config';
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ??
        'postgresql://sarvarbekxazratov@localhost:5432/elektrolearn',
      entities: [
        User,
        Organization,
        UserOrganization,
        RefreshToken,
        Level,
        Theory,
        Question,
        QuestionOption,
        UserProgress,
        UserLevelCompletion,
        UserQuestionAttempt,
        Certificate,
      ],
      synchronize: true,
    }),
    UsersModule,
    AuthModule,
    AnalyticsModule,
    UploadModule,
    ContentModule,
    OrganizationsModule,
    ProgressModule,
    StudentsModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
