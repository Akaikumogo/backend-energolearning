import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import { TelegramChatMessage } from '../database/entities/telegram-chat-message.entity';
import {
  TelegramNewsBroadcast,
  TelegramNewsDelivery,
} from '../database/entities/telegram-news.entity';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramBotAdminController } from './telegram-bot-admin.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramNewsController } from './telegram-news.controller';
import { TelegramNewsService } from './telegram-news.service';
import { TelegramReportImageService } from './telegram-report-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TelegramReportChat,
      TelegramChatMessage,
      TelegramBotSetting,
      TelegramNewsBroadcast,
      TelegramNewsDelivery,
      User,
      ModeratorPermission,
    ]),
    BranchAnalyticsModule,
    NotificationsModule,
  ],
  controllers: [TelegramBotAdminController, TelegramNewsController],
  providers: [
    TelegramBotService,
    TelegramReportImageService,
    TelegramNewsService,
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
