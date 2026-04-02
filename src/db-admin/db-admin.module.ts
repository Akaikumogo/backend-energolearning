import { Module } from '@nestjs/common';
import { DbAdminController } from './db-admin.controller';
import { DbAdminService } from './db-admin.service';

@Module({
  controllers: [DbAdminController],
  providers: [DbAdminService],
})
export class DbAdminModule {}

