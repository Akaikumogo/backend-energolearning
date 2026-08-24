import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { CertificatesModule } from './certificates/certificates.module';
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
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { SensitiveDataInterceptor } from './common/interceptors/sensitive-data.interceptor';
import { AdminRoleForbiddenViolationFilter } from './common/filters/admin-role-forbidden-violation.filter';
import { Position } from './database/entities/position.entity';
import { UserPosition } from './database/entities/user-position.entity';
import { Exam } from './database/entities/exam.entity';
import { ExamQuestion } from './database/entities/exam-question.entity';
import { ExamQuestionCatalog } from './database/entities/exam-question-catalog.entity';
import { ExamQuestionOption } from './database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from './database/entities/exam-question-position.entity';
import { QuestionPosition } from './database/entities/question-position.entity';
import { LevelPosition } from './database/entities/level-position.entity';
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
import { getPostgresConnectionOptions } from './database/postgres-env';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { AiChatSession } from './database/entities/ai-chat-session.entity';
import { AiChatMessage } from './database/entities/ai-chat-message.entity';
import { AudioBook } from './database/entities/audio-book.entity';
import { AudioChapter } from './database/entities/audio-chapter.entity';
import { AudioParagraph } from './database/entities/audio-paragraph.entity';
import { AudioLibraryModule } from './audio-library/audio-library.module';
import { NesEmployee } from './database/entities/nes-employee.entity';
import { NesEmployeeHistory } from './database/entities/nes-employee-history.entity';
import { NesEmployeePositionHistory } from './database/entities/nes-employee-position-history.entity';
import { NesEmployeesModule } from './nes-employees/nes-employees.module';
import { UserSession } from './database/entities/user-session.entity';
import { UserActivityEvent } from './database/entities/user-activity-event.entity';
import { UserActivityModule } from './user-activity/user-activity.module';
import { BranchAnalyticsModule } from './branch-analytics/branch-analytics.module';
import { DailyPlan } from './database/entities/daily-plan.entity';
import { EmployeeSyncSetting } from './database/entities/employee-sync-setting.entity';
import { TerminatedEmployee } from './database/entities/terminated-employee.entity';
import { Department } from './database/entities/department.entity';
import { OAuthIntegrationSetting } from './database/entities/oauth-integration-setting.entity';
import { AdminScriptsModule } from './admin-scripts/admin-scripts.module';
import { OneTimeCutoverModule } from './one-time-cutover/one-time-cutover.module';
import { LegacyModeratorMigrationModule } from './legacy-moderator-migration/legacy-moderator-migration.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';
import { AdminImportExportModule } from './admin-import-export/admin-import-export.module';
import { XpAnomaliesModule } from './xp-anomalies/xp-anomalies.module';
import { ReportSubmissionsModule } from './report-submissions/report-submissions.module';
import { ReportSubmission } from './database/entities/report-submission.entity';
import { OrganizationDivisionSetting } from './database/entities/organization-division-setting.entity';
import { ReportingActivationHistory } from './database/entities/reporting-activation-history.entity';
import { ReportingActivationModule } from './reporting-activation/reporting-activation.module';
import { SafetyRecordsModule } from './safety-records/safety-records.module';
import { SafetyRecordType } from './database/entities/safety-record-type.entity';
import { EmployeeSafetyRecord } from './database/entities/employee-safety-record.entity';
import { EmployeeSafetyRecordChange } from './database/entities/employee-safety-record-change.entity';
import { LibraryDocumentsModule } from './library-documents/library-documents.module';
import { LibraryDocument } from './database/entities/library-document.entity';
import { TelegramReportChat } from './database/entities/telegram-report-chat.entity';
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...getPostgresConnectionOptions(),
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
        ExamQuestionCatalog,
        ExamQuestionOption,
        ExamQuestionPosition,
        QuestionPosition,
        LevelPosition,
        ExamAssignment,
        ExamAttempt,
        ExamSession,
        ExamAttemptAnswer,
        Notification,
        AiChatSession,
        AiChatMessage,
        AudioBook,
        AudioChapter,
        AudioParagraph,
        NesEmployee,
        NesEmployeeHistory,
        NesEmployeePositionHistory,
        UserSession,
        UserActivityEvent,
        DailyPlan,
        EmployeeSyncSetting,
        TerminatedEmployee,
        OAuthIntegrationSetting,
        Department,
        ReportSubmission,
        OrganizationDivisionSetting,
        ReportingActivationHistory,
        SafetyRecordType,
        EmployeeSafetyRecord,
        EmployeeSafetyRecordChange,
        LibraryDocument,
        TelegramReportChat,
      ],
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
    }),
    UsersModule,
    AuthModule,
    AnalyticsModule,
    UploadModule,
    ContentModule,
    OrganizationsModule,
    ProgressModule,
    StudentsModule,
    CertificatesModule,
    SafetyRecordsModule,
    ReportingActivationModule,
    SeedModule,
    HeartsModule,
    ModeratorPermissionsModule,
    LeaderboardModule,
    AuditLogsModule,
    ExamsModule,
    ExamLiveModule,
    NotificationsModule,
    DbAdminModule,
    AiChatModule,
    AudioLibraryModule,
    LibraryDocumentsModule,
    NesEmployeesModule,
    UserActivityModule,
    BranchAnalyticsModule,
    AdminScriptsModule,
    OneTimeCutoverModule,
    LegacyModeratorMigrationModule,
    TelegramBotModule,
    AdminImportExportModule,
    XpAnomaliesModule,
    ReportSubmissionsModule,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: SensitiveDataInterceptor,
    },
    AdminAuditLogMiddleware,
    SecurityHeadersMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes('*')
      .apply(AdminAuditLogMiddleware)
      .forRoutes('admin');
  }
}
