import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
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
import { HeartsModule } from './hearts/hearts.module';
import { ModeratorPermission } from './database/entities/moderator-permission.entity';
import { ModeratorViolation } from './database/entities/moderator-violation.entity';
import { ModeratorPermissionsModule } from './moderator-permissions/moderator-permissions.module';
import { ModeratorPermissionsGuard } from './common/guards/moderator-permissions.guard';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { AdminAuditLog } from './database/entities/admin-audit-log.entity';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AdminAuditLogMiddleware } from './common/middleware/admin-audit-log.middleware';
import { AdminRoleForbiddenViolationFilter } from './common/filters/admin-role-forbidden-violation.filter';
import { Position } from './database/entities/position.entity';
import { UserPosition } from './database/entities/user-position.entity';
import { Exam } from './database/entities/exam.entity';
import { ExamQuestion } from './database/entities/exam-question.entity';
import { ExamQuestionOption } from './database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from './database/entities/exam-question-position.entity';
import { ExamAssignment } from './database/entities/exam-assignment.entity';
import { ExamAttempt } from './database/entities/exam-attempt.entity';
import { ExamSession } from './database/entities/exam-session.entity';
import { ExamAttemptAnswer } from './database/entities/exam-attempt-answer.entity';
import { ExamsModule } from './exams/exams.module';
import { ExamLiveModule } from './exam-live/exam-live.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { Notification } from './database/entities/notification.entity';
import { DbAdminModule } from './db-admin/db-admin.module';
import 'dotenv/config';
@Module({
  imports: [
    ScheduleModule.forRoot(),
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
        ModeratorPermission,
        ModeratorViolation,
        AdminAuditLog,
        Position,
        UserPosition,
        Exam,
        ExamQuestion,
        ExamQuestionOption,
        ExamQuestionPosition,
        ExamAssignment,
        ExamAttempt,
        ExamSession,
        ExamAttemptAnswer,
        Notification,
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
    HeartsModule,
    ModeratorPermissionsModule,
    LeaderboardModule,
    AuditLogsModule,
    ExamsModule,
    ExamLiveModule,
    NotificationsModule,
    DbAdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ModeratorPermissionsGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AdminRoleForbiddenViolationFilter,
    },
    AdminAuditLogMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AdminAuditLogMiddleware).forRoutes('admin');
  }
}
