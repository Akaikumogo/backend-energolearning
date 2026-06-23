import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Level } from '../database/entities/level.entity';
import { Theory } from '../database/entities/theory.entity';
import { Question } from '../database/entities/question.entity';
import { QuestionOption } from '../database/entities/question-option.entity';
import { User } from '../database/entities/user.entity';
import { ModeratorPermissionsModule } from '../moderator-permissions/moderator-permissions.module';
import { OAuthIntegrationModule } from '../oauth-integration/oauth-integration.module';
import { AdminImportExportController } from './admin-import-export.controller';
import { ContentImportExportService } from './content-import-export.service';
import { ModeratorsImportExportService } from './moderators-import-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Level, Theory, Question, QuestionOption, User]),
    ModeratorPermissionsModule,
    OAuthIntegrationModule,
  ],
  controllers: [AdminImportExportController],
  providers: [ContentImportExportService, ModeratorsImportExportService],
})
export class AdminImportExportModule {}
