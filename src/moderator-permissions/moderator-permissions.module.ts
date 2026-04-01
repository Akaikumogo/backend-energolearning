import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { ModeratorViolation } from '../database/entities/moderator-violation.entity';
import { ModeratorPermissionsController } from './moderator-permissions.controller';
import { ModeratorPermissionsService } from './moderator-permissions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModeratorPermission, ModeratorViolation])],
  controllers: [ModeratorPermissionsController],
  providers: [ModeratorPermissionsService],
  exports: [ModeratorPermissionsService],
})
export class ModeratorPermissionsModule {}

