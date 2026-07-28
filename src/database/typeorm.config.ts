import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Organization } from './entities/organization.entity';
import { UserOrganization } from './entities/user-organization.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { Level } from './entities/level.entity';
import { Theory } from './entities/theory.entity';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { UserProgress } from './entities/user-progress.entity';
import { UserLevelCompletion } from './entities/user-level-completion.entity';
import { UserQuestionAttempt } from './entities/user-question-attempt.entity';
import { Certificate } from './entities/certificate.entity';
import { ModeratorPermission } from './entities/moderator-permission.entity';
import { ModeratorViolation } from './entities/moderator-violation.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { Position } from './entities/position.entity';
import { UserPosition } from './entities/user-position.entity';
import { Exam } from './entities/exam.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { ExamQuestionCatalog } from './entities/exam-question-catalog.entity';
import { ExamQuestionOption } from './entities/exam-question-option.entity';
import { ExamQuestionPosition } from './entities/exam-question-position.entity';
import { QuestionPosition } from './entities/question-position.entity';
import { LevelPosition } from './entities/level-position.entity';
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamSession } from './entities/exam-session.entity';
import { ExamAttemptAnswer } from './entities/exam-attempt-answer.entity';
import { Notification } from './entities/notification.entity';
import { AudioBook } from './entities/audio-book.entity';
import { AudioChapter } from './entities/audio-chapter.entity';
import { AudioParagraph } from './entities/audio-paragraph.entity';
import { NesEmployee } from './entities/nes-employee.entity';
import { NesEmployeeHistory } from './entities/nes-employee-history.entity';
import { NesEmployeePositionHistory } from './entities/nes-employee-position-history.entity';
import { Init1743074000000 } from './migrations/0001-init';
import { AddUserAvatar1743076000000 } from './migrations/0002-add-user-avatar';
import { AddContentTables1743078000000 } from './migrations/0003-add-content-tables';
import { AddQuestionType1743080000000 } from './migrations/0004-add-question-type';
import { AddModeratorPermissionsAndViolations1743600000000 } from './migrations/0005-add-moderator-permissions-and-violations';
import { AddExamAndSystemTables1743950000000 } from './migrations/00055-add-exam-and-system-tables';
import { ExamQuestionCatalogs1744000000000 } from './migrations/0006-exam-question-catalogs';
import { TheorySlidesJsonb1744108800000 } from './migrations/0007-theory-slides-jsonb';
import { QuestionsOnLessonRoot1744200000000 } from './migrations/0008-questions-on-lesson-root';
import { TheoryRole1744300000000 } from './migrations/0009-theory-role';
import { AddAudioLibrary1746060000000 } from './migrations/0010-add-audio-library';
import { AddNesEmployees1746070000000 } from './migrations/0011-add-nes-employees';
import { AddActivityAndDailyPlan1746080000000 } from './migrations/0012-add-activity-and-daily-plan';
import { AddEnergoIdToUsers1746090000000 } from './migrations/0013-add-energo-id-to-users';
import { AddEmployeeSyncAndTerminationArchive1746100000000 } from './migrations/0014-add-employee-sync-and-termination-archive';
import { AddOrganizationEnergoMirror1746110000000 } from './migrations/0016-add-organization-energo-mirror';
import { AddAnalyticsIndexes1746200000000 } from './migrations/0015-add-analytics-indexes';
import { FixNesEmployeeUnique1746310000000 } from './migrations/0017-fix-nes-employee-unique';
import { AddAudioBookAudioUrl1746400000000 } from './migrations/0018-add-audio-book-audio-url';
import { AddHeartLostFlag1746500000000 } from './migrations/0019-add-heart-lost-flag';
import { OauthIntegrationSettings1746600000000 } from './migrations/0020-oauth-integration-settings';
import { AddQuestionPositions1746700000000 } from './migrations/0021-add-question-positions';
import { AddLevelPositions1746800000000 } from './migrations/0022-add-level-positions';
import { AddDepartmentsCatalog1746900000000 } from './migrations/0023-add-departments-catalog';
import { AddOrganizationParentAndDefault1746300000000 } from './migrations/0017-add-organization-parent-and-default';
import { AddCountsForXp1747000000000 } from './migrations/0024-add-counts-for-xp';
import { DedupeQuestionAttemptsPerDay1747100000000 } from './migrations/0025-dedupe-question-attempts-per-day';
import { BlockEmailLikeLogins1747200000000 } from './migrations/0026-block-email-like-logins';
import { AddReportSubmissions1747300000000 } from './migrations/0027-add-report-submissions';
import { AddOrganizationArchivedAt1747400000000 } from './migrations/0028-add-organization-archived-at';
import { AddReportSubmissionIntegrity1747500000000 } from './migrations/0029-add-report-submission-integrity';
import { DropEmployeeCertAndChecks1747600000000 } from './migrations/0030-drop-employee-cert-and-checks';
import { BackfillCountsForXp1747700000000 } from './migrations/0031-backfill-counts-for-xp';
import { FixCountsForXpDailyPlanOnly1747800000000 } from './migrations/0032-fix-counts-for-xp-daily-plan-only';
import { BackfillXpWithPlanCutoff1747900000000 } from './migrations/0033-backfill-xp-with-plan-cutoff';
import { EmployeeSyncSetting } from './entities/employee-sync-setting.entity';
import { TerminatedEmployee } from './entities/terminated-employee.entity';
import { OAuthIntegrationSetting } from './entities/oauth-integration-setting.entity';
import { Department } from './entities/department.entity';
import { ReportSubmission } from './entities/report-submission.entity';
import { getPostgresConnectionOptions } from './postgres-env';

export const AppDataSource = new DataSource({
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
    AudioBook,
    AudioChapter,
    AudioParagraph,
    NesEmployee,
    NesEmployeeHistory,
    NesEmployeePositionHistory,
    EmployeeSyncSetting,
    TerminatedEmployee,
    OAuthIntegrationSetting,
    Department,
    ReportSubmission,
  ],
  migrations: [
    Init1743074000000,
    AddUserAvatar1743076000000,
    AddContentTables1743078000000,
    AddQuestionType1743080000000,
    AddModeratorPermissionsAndViolations1743600000000,
    AddExamAndSystemTables1743950000000,
    ExamQuestionCatalogs1744000000000,
    TheorySlidesJsonb1744108800000,
    QuestionsOnLessonRoot1744200000000,
    TheoryRole1744300000000,
    AddAudioLibrary1746060000000,
    AddNesEmployees1746070000000,
    AddActivityAndDailyPlan1746080000000,
    AddEnergoIdToUsers1746090000000,
    AddEmployeeSyncAndTerminationArchive1746100000000,
    AddOrganizationEnergoMirror1746110000000,
    AddAnalyticsIndexes1746200000000,
    AddOrganizationParentAndDefault1746300000000,
    FixNesEmployeeUnique1746310000000,
    AddAudioBookAudioUrl1746400000000,
    AddHeartLostFlag1746500000000,
    OauthIntegrationSettings1746600000000,
    AddQuestionPositions1746700000000,
    AddLevelPositions1746800000000,
    AddDepartmentsCatalog1746900000000,
    AddCountsForXp1747000000000,
    DedupeQuestionAttemptsPerDay1747100000000,
    BlockEmailLikeLogins1747200000000,
    AddReportSubmissions1747300000000,
    AddOrganizationArchivedAt1747400000000,
    AddReportSubmissionIntegrity1747500000000,
    DropEmployeeCertAndChecks1747600000000,
    BackfillCountsForXp1747700000000,
    FixCountsForXpDailyPlanOnly1747800000000,
    BackfillXpWithPlanCutoff1747900000000,
  ],
  migrationsTableName: '_migrations',
  synchronize: false,
});
