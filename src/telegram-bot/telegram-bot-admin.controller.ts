import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  TelegramReplyDto,
  UpdateTelegramBotSettingsDto,
} from './dto/telegram-admin.dto';
import { TelegramBotService } from './telegram-bot.service';

@ApiTags('Admin Telegram Bot')
@Controller('admin/telegram-bot')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN, Role.MODERATOR)
@ApiBearerAuth('bearer')
export class TelegramBotAdminController {
  constructor(private readonly bot: TelegramBotService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Telegram bot sozlamalari' })
  getSettings() {
    return this.bot.getSettingsView();
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Token / web app URL yangilash' })
  updateSettings(
    @Body() dto: UpdateTelegramBotSettingsDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.bot.updateSettings(dto, req.user.id);
  }

  @Get('chats')
  @ApiOperation({ summary: 'Barcha chat va guruhlar' })
  listChats() {
    return this.bot.listChats();
  }

  @Get('chats/:id')
  @ApiOperation({ summary: 'Bitta chat' })
  getChat(@Param('id', ParseUUIDPipe) id: string) {
    return this.bot.getChat(id);
  }

  @Get('chats/:id/messages')
  @ApiOperation({ summary: 'Chat xabarlari (alohida thread)' })
  listMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.bot.listMessages(id, limit ? Number(limit) : 100);
  }

  @Post('chats/:id/reply')
  @ApiOperation({ summary: 'Admin / moderator javob yozadi' })
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TelegramReplyDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.bot.replyAsAdmin(id, dto.text, req.user.id);
  }

  @Post('chats/:id/send-report')
  @ApiOperation({ summary: 'Shu chatga hisobot yuborish' })
  sendReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.bot.sendReportToChat(id, req.user.id);
  }

  @Post('broadcast-report')
  @ApiOperation({ summary: 'Barcha /start|/hisobot chatlarga hisobot' })
  broadcast() {
    return this.bot.broadcastDailyReport().then(() => ({ ok: true }));
  }
}
