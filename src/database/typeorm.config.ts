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
import { ExamAssignment } from './entities/exam-assignment.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamSession } from './entities/exam-session.entity';
import { ExamAttemptAnswer } from './entities/exam-attempt-answer.entity';
import { Notification } from './entities/notification.entity';
import { EmployeeCertificate } from './entities/employee-certificate.entity';
import { EmployeeCheck } from './entities/employee-check.entity';
import { Init1743074000000 } from './migrations/0001-init';
import { AddUserAvatar1743076000000 } from './migrations/0002-add-user-avatar';
import { AddContentTables1743078000000 } from './migrations/0003-add-content-tables';
import { AddQuestionType1743080000000 } from './migrations/0004-add-question-type';
import { AddModeratorPermissionsAndViolations1743600000000 } from './migrations/0005-add-moderator-permissions-and-violations';
import { ExamQuestionCatalogs1744000000000 } from './migrations/0006-exam-question-catalogs';
import { TheorySlidesJsonb1744108800000 } from './migrations/0007-theory-slides-jsonb';
import { QuestionsOnLessonRoot1744200000000 } from './migrations/0008-questions-on-lesson-root';
import { TheoryRole1744300000000 } from './migrations/0009-theory-role';
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
    ExamAssignment,
    ExamAttempt,
    ExamSession,
    ExamAttemptAnswer,
    Notification,
    EmployeeCertificate,
    EmployeeCheck,
  ],
  migrations: [
    Init1743074000000,
    AddUserAvatar1743076000000,
    AddContentTables1743078000000,
    AddQuestionType1743080000000,
    AddModeratorPermissionsAndViolations1743600000000,
    ExamQuestionCatalogs1744000000000,
    TheorySlidesJsonb1744108800000,
    QuestionsOnLessonRoot1744200000000,
    TheoryRole1744300000000,
  ],
  migrationsTableName: '_migrations',
  synchronize: false,
});
