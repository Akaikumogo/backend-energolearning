import { Module } from '@nestjs/common';
import { OneTimeCutoverController } from './one-time-cutover.controller';
import { OneTimeCutoverGuard } from './one-time-cutover.guard';
import { OneTimeCutoverService } from './one-time-cutover.service';

@Module({
  controllers: [OneTimeCutoverController],
  providers: [OneTimeCutoverService, OneTimeCutoverGuard],
  exports: [OneTimeCutoverService],
})
export class OneTimeCutoverModule {}
