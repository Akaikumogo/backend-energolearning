import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import { TelegramChatMessage } from '../database/entities/telegram-chat-message.entity';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramBotAdminController } from './telegram-bot-admin.controller';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramReportImageService } from './telegram-report-image.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TelegramReportChat,
      TelegramChatMessage,
      TelegramBotSetting,
      User,
      ModeratorPermission,
    ]),
    BranchAnalyticsModule,
    NotificationsModule,
  ],
  controllers: [TelegramBotAdminController],
  providers: [TelegramBotService, TelegramReportImageService],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
