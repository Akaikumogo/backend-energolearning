import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProgress } from '../database/entities/user-progress.entity';
import { HeartsController } from './hearts.controller';
import { HeartsEvents } from './hearts.events';
import { HeartsService } from './hearts.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserProgress])],
  controllers: [HeartsController],
  providers: [HeartsService, HeartsEvents],
  exports: [HeartsService, HeartsEvents],
})
export class HeartsModule {}

