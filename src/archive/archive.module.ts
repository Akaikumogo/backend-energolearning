import { Module } from '@nestjs/common';
import { ElektroArchiveService } from './archive.service';
import { ElektroArchiveController } from './archive.controller';

@Module({
  controllers: [ElektroArchiveController],
  providers: [ElektroArchiveService],
  exports: [ElektroArchiveService],
})
export class ElektroArchiveModule {}
