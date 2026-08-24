import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramReportImageService } from './telegram-report-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramReportChat]),
    BranchAnalyticsModule,
  ],
  providers: [TelegramBotService, TelegramReportImageService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
