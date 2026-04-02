import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuditLog } from '../database/entities/admin-audit-log.entity';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminAuditLog]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'elektrolearn-dev-secret',
    }),
  ],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}

