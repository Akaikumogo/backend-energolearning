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
import { Init1743074000000 } from './migrations/0001-init';
import { AddUserAvatar1743076000000 } from './migrations/0002-add-user-avatar';
import { AddContentTables1743078000000 } from './migrations/0003-add-content-tables';
import { AddQuestionType1743080000000 } from './migrations/0004-add-question-type';

export const AppDataSource = new DataSource({
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
  migrations: [
    Init1743074000000,
    AddUserAvatar1743076000000,
    AddContentTables1743078000000,
    AddQuestionType1743080000000,
  ],
  migrationsTableName: '_migrations',
  synchronize: false,
});
