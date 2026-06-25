import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { User } from '../database/entities/user.entity';
import { LegacyModeratorMigrationController } from './legacy-moderator-migration.controller';
import { LegacyModeratorMigrationService } from './legacy-moderator-migration.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, ModeratorPermission])],
  controllers: [LegacyModeratorMigrationController],
  providers: [LegacyModeratorMigrationService],
})
export class LegacyModeratorMigrationModule {}
