import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ElektroArchiveService } from './archive.service';
import { ElektroArchiveController } from './archive.controller';

@Module({
  imports: [AuthModule],
  controllers: [ElektroArchiveController],
  providers: [ElektroArchiveService],
  exports: [ElektroArchiveService],
})
export class ElektroArchiveModule {}
