import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { BranchAnalyticsService } from '../branch-analytics/branch-analytics.service';
import { Role } from '../common/enums/role.enum';
import { tashkentToday } from '../common/utils/tashkent-time.util';
import { ModeratorPermission } from '../database/entities/moderator-permission.entity';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import {
  TelegramChatMessage,
  TelegramMessageKind,
} from '../database/entities/telegram-chat-message.entity';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramReportImageService } from './telegram-report-image.service';

const ENV_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ENV_WEB_APP =
  process.env.TELEGRAM_WEB_APP_URL ?? 'https://t.me/elektrolearnbot/Elektro_learn';

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

interface TgChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TgPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; file_name?: string; mime_type?: string };
  video?: { file_id: string; file_name?: string; mime_type?: string };
  animation?: { file_id: string; file_name?: string; mime_type?: string };
  voice?: { file_id: string; mime_type?: string };
  audio?: { file_id: string; file_name?: string; mime_type?: string; title?: string };
  video_note?: { file_id: string };
  sticker?: { file_id: string; emoji?: string; is_animated?: boolean; is_video?: boolean };
}

interface TgUpdate {
  update_id: number;
  message?: TgMessage;
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private offset = 0;
  private polling = false;
  private stopRequested = false;
  private sendingReport = false;
  private cachedToken: string | null = null;

  constructor(
    @InjectRepository(TelegramReportChat)
    private readonly chatRepo: Repository<TelegramReportChat>,
    @InjectRepository(TelegramChatMessage)
    private readonly msgRepo: Repository<TelegramChatMessage>,
    @InjectRepository(TelegramBotSetting)
    private readonly settingsRepo: Repository<TelegramBotSetting>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ModeratorPermission)
    private readonly modPermRepo: Repository<ModeratorPermission>,
    private readonly analytics: BranchAnalyticsService,
    private readonly imageService: TelegramReportImageService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const token = await this.resolveToken();
    if (!token) {
      this.logger.warn(
        'Telegram bot token yo‘q — superadmin «Telegram Bot» sahifasidan kiriting.',
      );
      return;
    }
    this.logger.log('Telegram bot ishga tushmoqda (18:00 hisobot)...');
    void this.startPolling();
  }

  onModuleDestroy() {
    this.stopRequested = true;
  }

  /** Token yangilanganda pollingni qayta boshlash. */
  async restartPolling() {
    this.stopRequested = true;
    this.cachedToken = null;
    // Polling loop chiqishini kutish
    for (let i = 0; i < 40 && this.polling; i++) {
      await this.sleep(250);
    }
    this.stopRequested = false;
    this.offset = 0;
    const token = await this.resolveToken();
    if (!token) {
      this.logger.warn('Token yo‘q — polling to‘xtatildi');
      return;
    }
    this.logger.log('Telegram polling qayta boshlandi');
    void this.startPolling();
  }

  async getSettingsView() {
    const row = await this.ensureSettings();
    const token = row.botToken?.trim() || ENV_TOKEN || null;
    return {
      hasToken: !!token,
      tokenMasked: token ? this.maskToken(token) : null,
      webAppUrl: row.webAppUrl || ENV_WEB_APP,
      isEnabled: row.isEnabled,
      polling: this.polling,
      updatedAt: row.updatedAt,
    };
  }

  async updateSettings(
    input: { botToken?: string; webAppUrl?: string; isEnabled?: boolean },
    adminId: string,
  ) {
    const row = await this.ensureSettings();
    const prevToken = (row.botToken?.trim() || ENV_TOKEN || '').trim();

    if (input.botToken !== undefined) {
      const next = input.botToken.trim();
      if (next) {
        // Masked qiymatni qayta yozmaslik
        if (!next.includes('…') && !next.includes('...')) {
          row.botToken = next;
        }
      } else {
        row.botToken = null;
      }
    }
    if (input.webAppUrl !== undefined) {
      row.webAppUrl = input.webAppUrl.trim() || null;
    }
    if (input.isEnabled !== undefined) {
      row.isEnabled = input.isEnabled;
    }
    row.updatedBy = adminId;
    await this.settingsRepo.save(row);

    const newToken = (row.botToken?.trim() || ENV_TOKEN || '').trim();
    if (newToken !== prevToken || input.isEnabled !== undefined) {
      await this.restartPolling();
    }

    return this.getSettingsView();
  }

  async listChats() {
    const rows = await this.chatRepo.find({
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
    });
    return rows.map((c) => this.serializeChat(c));
  }

  async getChat(id: string) {
    const chat = await this.chatRepo.findOne({ where: { id } });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    return this.serializeChat(chat);
  }

  async listMessages(chatId: string, limit = 100) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat topilmadi');

    const take = Math.min(Math.max(limit, 1), 300);
    const latest = await this.msgRepo.find({
      where: { chatRowId: chatId },
      order: { createdAt: 'DESC' },
      take,
    });
    const msgs = latest.reverse();

    // Eski xabarlar: faqat file_id bor — bir marta yuklab saqlaymiz
    for (const m of msgs) {
      if (m.mediaFileId && !m.mediaUrl) {
        const saved = await this.downloadTelegramMedia(
          m.mediaFileId,
          m.mediaFileName || undefined,
          m.mediaMime || undefined,
        ).catch(() => null);
        if (saved) {
          m.mediaUrl = saved.mediaUrl;
          m.mediaFileName = saved.mediaFileName;
          m.mediaMime = saved.mediaMime;
          await this.msgRepo.save(m);
        }
      }
    }

    if (chat.unreadCount > 0) {
      chat.unreadCount = 0;
      await this.chatRepo.save(chat);
    }

    return {
      chat: this.serializeChat(chat),
      messages: msgs.map((m) => this.serializeMessage(m)),
    };
  }

  async replyAsAdmin(chatId: string, text: string, adminId: string) {
    const body = (text || '').trim();
    if (!body) throw new BadRequestException('Matn bo‘sh');
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat topilmadi');

    const sent = await this.apiSendMessage(Number(chat.chatId), body);
    await this.persistOutbound(chat, {
      kind: 'text',
      text: body,
      telegramMessageId: sent?.message_id != null ? String(sent.message_id) : null,
      sentByAdminId: adminId,
    });
    return { ok: true };
  }

  async sendReportToChat(chatId: string, adminId?: string) {
    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat topilmadi');
    await this.deliverReportToChat(chat, adminId);
    return { ok: true };
  }

  @Cron('0 18 * * *', { timeZone: 'Asia/Tashkent' })
  async handleDailyReportCron() {
    const token = await this.resolveToken();
    if (!token) return;
    const settings = await this.ensureSettings();
    if (!settings.isEnabled) return;
    this.logger.log('Kunlik hisobot cron (18:00 Asia/Tashkent)');
    await this.broadcastDailyReport();
  }

  async broadcastDailyReport() {
    if (this.sendingReport) {
      this.logger.warn('Hisobot yuborish allaqachon davom etmoqda');
      return;
    }
    this.sendingReport = true;
    try {
      const chats = await this.chatRepo.find({
        where: { reportEnabled: true, isActive: true },
      });
      if (!chats.length) {
        this.logger.warn('Hisobot uchun /start yoki /hisobot bosgan chat yo‘q');
        return;
      }
      const payload = await this.buildReportPayload();
      for (const chat of chats) {
        await this.deliverReportToChat(chat, undefined, payload).catch((err) =>
          this.logger.error(
            `chat ${chat.chatId}: ${err?.message || err}`,
          ),
        );
      }
      this.logger.log(`Hisobot ${chats.length} ta chatga yuborildi`);
    } catch (err: any) {
      this.logger.error(`Hisobot xato: ${err?.message || err}`);
    } finally {
      this.sendingReport = false;
    }
  }

  // ─── polling ─────────────────────────────────────────────

  private async startPolling() {
    if (this.polling) return;
    this.polling = true;

    while (!this.stopRequested) {
      try {
        const token = await this.resolveToken();
        const settings = await this.ensureSettings();
        if (!token || !settings.isEnabled) {
          await this.sleep(5000);
          continue;
        }
        const updates = await this.getUpdates(token);
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update).catch((err) =>
            this.logger.error(`Update: ${err?.message || err}`),
          );
        }
      } catch (err: any) {
        this.logger.error(`Polling: ${err?.message || err}`);
        await this.sleep(3000);
      }
    }

    this.polling = false;
  }

  private async getUpdates(token: string): Promise<TgUpdate[]> {
    const url =
      `https://api.telegram.org/bot${token}/getUpdates` +
      `?timeout=30&offset=${this.offset}` +
      `&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.ok) throw new Error(`getUpdates: ${JSON.stringify(data)}`);
    return data.result as TgUpdate[];
  }

  private async handleUpdate(update: TgUpdate) {
    const msg = update.message;
    if (!msg) return;

    const chatRow = await this.upsertChat(msg.chat, msg.from);
    const cmd = this.extractCommand(msg.text);

    // Har bir xabar shu chat threadiga yoziladi — boshqa chatlar bilan aralashmaydi
    await this.persistInbound(chatRow, msg, cmd);

    if (cmd === '/start' || cmd === '/hisobot') {
      await this.enableReports(chatRow, msg.from);
      if (cmd === '/start') {
        await this.replyStart(chatRow, msg.chat, msg.from);
      } else {
        await this.apiSendMessage(
          Number(chatRow.chatId),
          '⏳ Ҳисобот тайёрланмоқда...',
        );
        await this.deliverReportToChat(chatRow);
      }
      return;
    }

    if (cmd === '/history') {
      const isoDate = this.parseHistoryDate(msg.text);
      if (!isoDate) {
        await this.sendAndStore(
          chatRow,
          '📅 Format: <code>/history dd.mm.yyyy</code>\n' +
            'Masalan: <code>/history 25.08.2026</code>',
        );
        return;
      }
      const today = tashkentToday();
      if (isoDate > today) {
        await this.sendAndStore(
          chatRow,
          '⚠️ Kelajak sanasi uchun hisobot yo‘q.\n' +
            'Format: <code>/history dd.mm.yyyy</code>',
        );
        return;
      }
      await this.apiSendMessage(
        Number(chatRow.chatId),
        `⏳ ${isoDate.split('-').reverse().join('.')} hisoboti tayyorlanmoqda...`,
      );
      await this.deliverDailyHistoryToChat(chatRow, isoDate);
      return;
    }

    if (cmd === '/stop_report' || cmd === '/stop') {
      chatRow.reportEnabled = false;
      await this.chatRepo.save(chatRow);
      await this.sendAndStore(
        chatRow,
        '🛑 Кунлик ҳисобот ўчирилди.\nҚайта ёқиш: /start ёки /hisobot',
      );
      return;
    }

    if (cmd === '/report_now') {
      await this.enableReports(chatRow, msg.from);
      await this.apiSendMessage(
        Number(chatRow.chatId),
        '⏳ Ҳисобот тайёрланмоқда...',
      );
      await this.deliverReportToChat(chatRow);
      return;
    }

    // Oddiy xabar — faqat inboxga tushadi; avto-javob yo‘q (superadmin javob yozadi)
  }

  private extractCommand(text?: string): string | null {
    if (!text) return null;
    const raw = text.trim().split(/\s+/)[0] || '';
    if (!raw.startsWith('/')) return null;
    return raw.split('@')[0].toLowerCase();
  }

  /** `/history 25.08.2026` → `2026-08-25` yoki null */
  private parseHistoryDate(text?: string): string | null {
    if (!text) return null;
    const token = text
      .trim()
      .split(/\s+/)
      .slice(1)
      .find((p) => /^\d{2}\.\d{2}\.\d{4}$/.test(p));
    if (!token) return null;
    const [ddS, mmS, yyyyS] = token.split('.');
    const dd = Number(ddS);
    const mm = Number(mmS);
    const yyyy = Number(yyyyS);
    if (!dd || !mm || !yyyy) return null;
    const probe = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      probe.getUTCFullYear() !== yyyy ||
      probe.getUTCMonth() !== mm - 1 ||
      probe.getUTCDate() !== dd
    ) {
      return null;
    }
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  private async upsertChat(chat: TgChat, from?: TgUser) {
    let row = await this.chatRepo.findOne({
      where: { chatId: String(chat.id) },
    });
    const isPrivate = chat.type === 'private';

    if (!row) {
      row = this.chatRepo.create({
        chatId: String(chat.id),
        chatType: chat.type,
        chatTitle: isPrivate
          ? [chat.first_name || from?.first_name, chat.last_name || from?.last_name]
              .filter(Boolean)
              .join(' ') || from?.username || `User ${chat.id}`
          : chat.title ?? null,
        peerUserId: isPrivate ? String(from?.id ?? chat.id) : null,
        peerUsername: isPrivate
          ? from?.username ?? chat.username ?? null
          : null,
        peerFirstName: isPrivate
          ? from?.first_name ?? chat.first_name ?? null
          : null,
        peerLastName: isPrivate
          ? from?.last_name ?? chat.last_name ?? null
          : null,
        reportEnabled: false,
        isActive: true,
        unreadCount: 0,
      });
    } else {
      row.chatType = chat.type;
      row.isActive = true;
      if (!isPrivate && chat.title) row.chatTitle = chat.title;
      if (isPrivate) {
        row.peerUserId = String(from?.id ?? chat.id);
        row.peerUsername = from?.username ?? chat.username ?? row.peerUsername;
        row.peerFirstName =
          from?.first_name ?? chat.first_name ?? row.peerFirstName;
        row.peerLastName =
          from?.last_name ?? chat.last_name ?? row.peerLastName;
        row.chatTitle =
          [row.peerFirstName, row.peerLastName].filter(Boolean).join(' ') ||
          row.peerUsername ||
          row.chatTitle;
      }
    }
    return this.chatRepo.save(row);
  }

  private async enableReports(chat: TelegramReportChat, from?: TgUser) {
    chat.reportEnabled = true;
    chat.isActive = true;
    if (from) {
      chat.startedByUserId = String(from.id);
      chat.startedByUsername = from.username ?? null;
    }
    await this.chatRepo.save(chat);
  }

  private async replyStart(
    chatRow: TelegramReportChat,
    chat: TgChat,
    from?: TgUser,
  ) {
    const webApp = await this.resolveWebAppUrl();
    const isGroup = chat.type === 'group' || chat.type === 'supergroup';

    if (isGroup) {
      await this.sendAndStore(
        chatRow,
        `✅ <b>Elektro Learn</b>\n\n` +
          `Men ishga tushdim.\n` +
          `Endi sizlarga har kuni <b>18:00</b> da (Toshkent) hisobot topshiraman.\n\n` +
          `📊 Kunlik + oylik jadval rasmlari\n` +
          `⏱ Vaqt: har kuni 18:00\n\n` +
          `Hozirgi hisobot: /hisobot\n` +
          `Arxiv: /history dd.mm.yyyy\n` +
          `Oʻchirish: /stop_report`,
      );
      return;
    }

    const name = from?.first_name ? `, ${from.first_name}` : '';
    await this.sendAndStore(
      chatRow,
      `👋 Ассалому алайкум${name}!\n\n` +
        `⚡ <b>Электро Learn</b> ботига хуш келибсиз!\n\n` +
        `Ҳар куни <b>18:00</b> да ҳисобот олиб турасиз.\n` +
        `Ҳозир олиш: /hisobot\n` +
        `Архив: /history dd.mm.yyyy`,
      {
        inline_keyboard: [
          [{ text: '🚀 Elektro Learn Web App', url: webApp }],
        ],
      },
    );
  }

  private async persistInbound(
    chat: TelegramReportChat,
    msg: TgMessage,
    cmd: string | null,
  ) {
    const fromName = [msg.from?.first_name, msg.from?.last_name]
      .filter(Boolean)
      .join(' ');
    let kind: TelegramMessageKind = 'text';
    let text = msg.text ?? null;
    let mediaFileId: string | null = null;
    let preferredName: string | undefined;
    let preferredMime: string | undefined;

    if (msg.photo?.length) {
      kind = 'photo';
      mediaFileId = msg.photo[msg.photo.length - 1]!.file_id;
      text = msg.caption || '📷 Rasm';
      preferredName = 'photo.jpg';
      preferredMime = 'image/jpeg';
    } else if (msg.video) {
      kind = 'video';
      mediaFileId = msg.video.file_id;
      text = msg.caption || '🎬 Video';
      preferredName = msg.video.file_name || 'video.mp4';
      preferredMime = msg.video.mime_type;
    } else if (msg.animation) {
      kind = 'video';
      mediaFileId = msg.animation.file_id;
      text = msg.caption || '🎞️ GIF';
      preferredName = msg.animation.file_name || 'animation.mp4';
      preferredMime = msg.animation.mime_type;
    } else if (msg.video_note) {
      kind = 'video';
      mediaFileId = msg.video_note.file_id;
      text = '⏺ Video xabar';
      preferredName = 'video_note.mp4';
      preferredMime = 'video/mp4';
    } else if (msg.voice) {
      kind = 'audio';
      mediaFileId = msg.voice.file_id;
      text = '🎤 Ovozli xabar';
      preferredName = 'voice.ogg';
      preferredMime = msg.voice.mime_type || 'audio/ogg';
    } else if (msg.audio) {
      kind = 'audio';
      mediaFileId = msg.audio.file_id;
      text =
        msg.caption ||
        `🎵 ${msg.audio.title || msg.audio.file_name || 'Audio'}`;
      preferredName = msg.audio.file_name || 'audio.mp3';
      preferredMime = msg.audio.mime_type;
    } else if (msg.sticker) {
      kind = 'photo';
      mediaFileId = msg.sticker.file_id;
      text = msg.sticker.emoji
        ? `Sticker ${msg.sticker.emoji}`
        : 'Sticker';
      preferredName = msg.sticker.is_video
        ? 'sticker.webm'
        : msg.sticker.is_animated
          ? 'sticker.tgs'
          : 'sticker.webp';
      preferredMime = msg.sticker.is_video
        ? 'video/webm'
        : 'image/webp';
    } else if (msg.document) {
      kind = 'document';
      mediaFileId = msg.document.file_id;
      text = msg.caption || `📄 ${msg.document.file_name || 'Fayl'}`;
      preferredName = msg.document.file_name || 'file';
      preferredMime = msg.document.mime_type;
    } else if (cmd) {
      kind = 'command';
    } else if (!text) {
      kind = 'other';
      text = text || '[media]';
    }

    let mediaUrl: string | null = null;
    let mediaFileName: string | null = null;
    let mediaMime: string | null = preferredMime ?? null;

    if (mediaFileId) {
      const saved = await this.downloadTelegramMedia(
        mediaFileId,
        preferredName,
        preferredMime,
      ).catch((err) => {
        this.logger.warn(
          `Telegram media yuklab bo‘lmadi: ${err?.message || err}`,
        );
        return null;
      });
      if (saved) {
        mediaUrl = saved.mediaUrl;
        mediaFileName = saved.mediaFileName;
        mediaMime = saved.mediaMime;
      }
    }

    const preview = (text || msg.caption || '[xabar]').slice(0, 180);
    await this.msgRepo.save(
      this.msgRepo.create({
        chatRowId: chat.id,
        direction: 'in',
        kind,
        telegramMessageId: String(msg.message_id),
        fromUserId: msg.from ? String(msg.from.id) : null,
        fromUsername: msg.from?.username ?? null,
        fromName: fromName || null,
        text,
        caption: msg.caption ?? null,
        mediaFileId,
        mediaUrl,
        mediaFileName,
        mediaMime,
        isCommand: !!cmd,
        commandName: cmd,
      }),
    );

    chat.lastMessageAt = new Date();
    chat.lastMessagePreview = preview;
    chat.unreadCount = (chat.unreadCount || 0) + 1;
    await this.chatRepo.save(chat);

    // Botning o'zi yozgan xabarlar — web notificationga tushmasin
    if (msg.from?.is_bot) return;

    void this.notifyAdminsAboutInbound(chat, preview, cmd).catch((err) =>
      this.logger.warn(`Telegram notify: ${err?.message || err}`),
    );
  }

  /** Telegram file_id → `uploads/telegram/...` */
  private async downloadTelegramMedia(
    fileId: string,
    preferredName?: string,
    preferredMime?: string,
  ): Promise<{
    mediaUrl: string;
    mediaFileName: string | null;
    mediaMime: string | null;
  } | null> {
    const token = await this.resolveToken();
    if (!token) return null;

    const metaRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );
    const meta: any = await metaRes.json();
    if (!meta?.ok || !meta.result?.file_path) {
      this.logger.warn(`getFile failed: ${JSON.stringify(meta)}`);
      return null;
    }

    const remotePath = String(meta.result.file_path);
    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${token}/${remotePath}`,
    );
    if (!fileRes.ok) {
      this.logger.warn(`file download HTTP ${fileRes.status}`);
      return null;
    }

    const remoteExt = extname(remotePath);
    const nameExt = preferredName ? extname(preferredName) : '';
    const ext = remoteExt || nameExt || '';
    const safeBase = (preferredName || 'media')
      .replace(/[^\w.\-()+ ]+/g, '_')
      .slice(0, 80);
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}${ext || ''}`;
    const absDir = join(process.cwd(), 'uploads', 'telegram');
    await fs.mkdir(absDir, { recursive: true });
    const absPath = join(absDir, filename);

    // Buffer orqali — Node/undici stream farqlaridan qochish
    const buf = Buffer.from(await fileRes.arrayBuffer());
    await fs.writeFile(absPath, buf);

    return {
      mediaUrl: `/uploads/telegram/${filename}`,
      mediaFileName: preferredName || safeBase || filename,
      mediaMime: preferredMime ?? null,
    };
  }

  private async notifyAdminsAboutInbound(
    chat: TelegramReportChat,
    preview: string,
    cmd: string | null,
  ) {
    const title =
      cmd === '/start'
        ? 'Telegram: /start'
        : cmd
          ? `Telegram: ${cmd}`
          : 'Telegram: yangi xabar';
    const body = `${chat.chatTitle || chat.peerUsername || chat.chatId}: ${preview}`;
    const data = {
      type: 'telegram_bot',
      chatRowId: chat.id,
      reviewPath: '/dashboard/telegram-bot',
      command: cmd,
    };

    const recipientIds = new Set<string>();

    const supers = await this.userRepo.find({
      where: { role: Role.SUPERADMIN },
      select: ['id'],
    });
    for (const u of supers) recipientIds.add(u.id);

    const modPerms = await this.modPermRepo.find();
    for (const row of modPerms) {
      if (row.permissions?.telegramBot?.view) {
        recipientIds.add(row.moderatorUserId);
      }
    }

    for (const userId of recipientIds) {
      await this.notifications.create({
        userId,
        title,
        body,
        data,
      });
    }
  }

  private async persistOutbound(
    chat: TelegramReportChat,
    opts: {
      kind: TelegramMessageKind;
      text: string;
      telegramMessageId?: string | null;
      sentByAdminId?: string | null;
      caption?: string | null;
    },
  ) {
    await this.msgRepo.save(
      this.msgRepo.create({
        chatRowId: chat.id,
        direction: 'out',
        kind: opts.kind,
        telegramMessageId: opts.telegramMessageId ?? null,
        text: opts.text,
        caption: opts.caption ?? null,
        isCommand: false,
        sentByAdminId: opts.sentByAdminId ?? null,
        fromName: opts.sentByAdminId ? 'Admin' : 'Bot',
      }),
    );
    // Preview faqat odam xabarlari uchun — bot javobi notification/previewni bosib ketmasin
    chat.lastMessageAt = new Date();
    if (opts.sentByAdminId) {
      chat.lastMessagePreview = opts.text.slice(0, 180);
    }
    await this.chatRepo.save(chat);
  }

  private async sendAndStore(
    chat: TelegramReportChat,
    text: string,
    replyMarkup?: unknown,
  ) {
    const sent = await this.apiSendMessage(
      Number(chat.chatId),
      text,
      replyMarkup,
    );
    await this.persistOutbound(chat, {
      kind: 'text',
      text,
      telegramMessageId: sent?.message_id != null ? String(sent.message_id) : null,
    });
  }

  private async deliverReportToChat(
    chat: TelegramReportChat,
    adminId?: string,
    ready?: {
      dailyPng: Buffer;
      monthlyPng: Buffer;
      dailyCaption: string;
      monthlyCaption: string;
    },
  ) {
    const payload = ready ?? (await this.buildReportPayload());
    const chatId = Number(chat.chatId);

    const sentDaily = await this.apiSendPhoto(
      chatId,
      payload.dailyPng,
      payload.dailyCaption,
      'elektro-learn-kunlik.png',
    );
    await this.persistOutbound(chat, {
      kind: 'report',
      text: payload.dailyCaption.replace(/<[^>]+>/g, ''),
      caption: payload.dailyCaption,
      telegramMessageId:
        sentDaily?.message_id != null ? String(sentDaily.message_id) : null,
      sentByAdminId: adminId ?? null,
    });

    const sentMonthly = await this.apiSendPhoto(
      chatId,
      payload.monthlyPng,
      payload.monthlyCaption,
      'elektro-learn-oylik.png',
    );
    await this.persistOutbound(chat, {
      kind: 'report',
      text: payload.monthlyCaption.replace(/<[^>]+>/g, ''),
      caption: payload.monthlyCaption,
      telegramMessageId:
        sentMonthly?.message_id != null ? String(sentMonthly.message_id) : null,
      sentByAdminId: adminId ?? null,
    });
  }

  /** `/history` — faqat tanlangan kunlik hisobot */
  private async deliverDailyHistoryToChat(
    chat: TelegramReportChat,
    planDate: string,
  ) {
    const { dailyPng, dailyCaption } =
      await this.buildDailyHistoryPayload(planDate);
    const chatId = Number(chat.chatId);
    const sentDaily = await this.apiSendPhoto(
      chatId,
      dailyPng,
      dailyCaption,
      `elektro-learn-${planDate}.png`,
    );
    await this.persistOutbound(chat, {
      kind: 'report',
      text: dailyCaption.replace(/<[^>]+>/g, ''),
      caption: dailyCaption,
      telegramMessageId:
        sentDaily?.message_id != null ? String(sentDaily.message_id) : null,
    });
  }

  private async buildDailyHistoryPayload(planDate: string): Promise<{
    dailyPng: Buffer;
    dailyCaption: string;
  }> {
    const daily = await this.analytics.getDailyReport(planDate, null);
    const dailyBranches = daily.branches.filter((b) => !b.isDefault);

    const completedTotal = dailyBranches.reduce(
      (s, b) => s + (b.completed ?? 0),
      0,
    );
    const totalPlan = dailyBranches.reduce((s, b) => s + (b.plan ?? 0), 0);
    const totalEmployees = dailyBranches.reduce(
      (s, b) => s + (b.totalEmployees ?? 0),
      0,
    );
    const completedEmployees = dailyBranches.reduce(
      (s, b) => s + (b.completedEmployees ?? 0),
      0,
    );
    const extraCorrectTotal = dailyBranches.reduce(
      (s, b) => s + (b.extraCorrect ?? 0),
      0,
    );
    const completionPercent =
      totalPlan > 0
        ? Math.round((completedTotal / totalPlan) * 1000) / 10
        : 0;

    const dailyPng = await this.imageService.buildDailyReportPng({
      planDate: daily.planDate,
      completionPercent,
      completedTotal,
      totalPlan,
      totalEmployees,
      completedEmployees,
      extraCorrectTotal,
      branchCount: dailyBranches.length,
      branches: dailyBranches.map((b) => ({
        orgName: b.orgName,
        percent: b.percent,
        status: b.status,
        completed: b.completed,
        plan: b.plan,
      })),
    });

    const missingCount = dailyBranches.filter(
      (b) => (b.completed ?? 0) === 0 && (b.percent ?? 0) <= 0,
    ).length;
    const [y, m, d] = daily.planDate.split('-');
    const dailyCaption =
      `⚡ <b>Elektro Learn</b> — kunlik hisobot\n` +
      `${d}.${m}.${y} · arxiv\n` +
      `Natija: <b>${completionPercent.toFixed(1)}%</b>` +
      (missingCount > 0
        ? ` · <b>${missingCount}</b> filial hisobot bermadi`
        : '');

    return { dailyPng, dailyCaption };
  }

  private async buildReportPayload(): Promise<{
    dailyPng: Buffer;
    monthlyPng: Buffer;
    dailyCaption: string;
    monthlyCaption: string;
  }> {
    const planDate = tashkentToday();
    const month = planDate.slice(0, 7);
    const [daily, monthly] = await Promise.all([
      this.analytics.getDailyReport(planDate, null),
      this.analytics.getMonthlyReport(month, null),
    ]);

    // Asosiy / main branch (isDefault) hisobot cardlariga kirmaydi
    const dailyBranches = daily.branches.filter((b) => !b.isDefault);
    const monthlyBranches = monthly.branches.filter((b) => !b.isDefault);

    const completedTotal = dailyBranches.reduce(
      (s, b) => s + (b.completed ?? 0),
      0,
    );
    const totalPlan = dailyBranches.reduce((s, b) => s + (b.plan ?? 0), 0);
    const totalEmployees = dailyBranches.reduce(
      (s, b) => s + (b.totalEmployees ?? 0),
      0,
    );
    const completedEmployees = dailyBranches.reduce(
      (s, b) => s + (b.completedEmployees ?? 0),
      0,
    );
    const extraCorrectTotal = dailyBranches.reduce(
      (s, b) => s + (b.extraCorrect ?? 0),
      0,
    );
    const completionPercent =
      totalPlan > 0
        ? Math.round((completedTotal / totalPlan) * 1000) / 10
        : 0;

    // Bitta metrika: filiallar o'rtachasi (main branch siz)
    const monthlyAvg =
      monthlyBranches.length > 0
        ? Math.round(
            (monthlyBranches.reduce(
              (s, b) => s + (b.averageMonthlyPercent ?? 0),
              0,
            ) /
              monthlyBranches.length) *
              10,
          ) / 10
        : 0;

    const monthStart = `${month}-01`;
    const lastTrendDay =
      monthly.trend.length > 0
        ? monthly.trend[monthly.trend.length - 1]!.date
        : planDate;
    const orgIds = monthlyBranches.map((b) => b.orgId);
    const branchSeries = await this.analytics.getBranchDailySeries(
      monthStart,
      lastTrendDay,
      orgIds,
    );

    const dailyInput = {
      planDate: daily.planDate,
      completionPercent,
      completedTotal,
      totalPlan,
      totalEmployees,
      completedEmployees,
      extraCorrectTotal,
      branchCount: dailyBranches.length,
      branches: dailyBranches.map((b) => ({
        orgName: b.orgName,
        percent: b.percent,
        status: b.status,
        completed: b.completed,
        plan: b.plan,
      })),
    };

    const monthlyInput = {
      month: monthly.month,
      averagePercent: monthlyAvg,
      branchCount: monthlyBranches.length,
      daysInMonth: monthly.daysInMonth,
      branches: monthlyBranches.map((b) => {
        const series = branchSeries.get(b.orgId) ?? [];
        const dailyPercents = Array.from(
          { length: monthly.daysInMonth },
          (_, i) => {
            const dayNum = i + 1;
            const iso = `${month}-${String(dayNum).padStart(2, '0')}`;
            const hit = series.find((p) => p.date === iso);
            if (!hit) {
              // kelajak yoki ma'lumot yo'q
              return iso > lastTrendDay ? -1 : 0;
            }
            return hit.percent;
          },
        );
        return {
          orgId: b.orgId,
          orgName: b.orgName,
          percent: b.averageMonthlyPercent,
          averageMonthlyPercent: b.averageMonthlyPercent,
          status: this.statusFromPercent(b.averageMonthlyPercent),
          dailyPercents,
        };
      }),
      dailyPoints: monthly.trend.map((p) => ({
        date: p.date,
        percent: p.percent,
        completed: p.completed,
        plan: p.plan,
      })),
    };

    const [dailyPng, monthlyPng] = await Promise.all([
      this.imageService.buildDailyReportPng(dailyInput),
      this.imageService.buildMonthlyReportPng(monthlyInput),
    ]);

    const missingCount = dailyBranches.filter(
      (b) => (b.completed ?? 0) === 0 && (b.percent ?? 0) <= 0,
    ).length;

    const [y, m, d] = daily.planDate.split('-');
    const dailyCaption =
      `⚡ <b>Elektro Learn</b> — kunlik hisobot\n` +
      `${d}.${m}.${y} · 18:00\n` +
      `Bugun: <b>${completionPercent.toFixed(1)}%</b>` +
      (missingCount > 0
        ? ` · <b>${missingCount}</b> filial hisobot bermadi`
        : '');

    const [yy, mm] = monthly.month.split('-');
    const monthlyCaption =
      `🗓 <b>Elektro Learn</b> — oylik hisobot\n` +
      `${mm}.${yy} · ${monthly.trend.length} kun\n` +
      `Oylik oʻrtacha: <b>${monthlyAvg.toFixed(1)}%</b>`;

    return { dailyPng, monthlyPng, dailyCaption, monthlyCaption };
  }

  // ─── Telegram API ────────────────────────────────────────

  private async apiSendMessage(
    chatId: number,
    text: string,
    replyMarkup?: unknown,
  ): Promise<{ message_id?: number } | null> {
    const token = await this.resolveToken();
    if (!token) throw new BadRequestException('Bot token o‘rnatilmagan');

    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const data: any = await res.json();
    if (!data.ok) {
      this.logger.error(`sendMessage: ${JSON.stringify(data)}`);
      throw new BadRequestException(
        data.description || 'Telegramga yuborib bo‘lmadi',
      );
    }
    return data.result ?? null;
  }

  private async apiSendPhoto(
    chatId: number,
    png: Buffer,
    caption: string,
    filename = 'elektro-learn-report.png',
  ): Promise<{ message_id?: number } | null> {
    const token = await this.resolveToken();
    if (!token) throw new BadRequestException('Bot token o‘rnatilmagan');

    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', 'HTML');
    form.append(
      'photo',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      filename,
    );

    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      { method: 'POST', body: form },
    );
    const data: any = await res.json();
    if (!data.ok) {
      throw new Error(`sendPhoto: ${JSON.stringify(data)}`);
    }
    return data.result ?? null;
  }

  // ─── helpers ─────────────────────────────────────────────

  private async ensureSettings() {
    let row = await this.settingsRepo.findOne({
      where: { source: 'default' },
    });
    if (!row) {
      row = await this.settingsRepo.save(
        this.settingsRepo.create({
          source: 'default',
          botToken: ENV_TOKEN || null,
          webAppUrl: ENV_WEB_APP,
          isEnabled: true,
        }),
      );
    }
    return row;
  }

  private async resolveToken(): Promise<string | null> {
    this.cachedToken = null;
    const row = await this.ensureSettings();
    const token = (row.botToken?.trim() || ENV_TOKEN || '').trim();
    this.cachedToken = token || null;
    return this.cachedToken;
  }

  private async resolveWebAppUrl(): Promise<string> {
    const row = await this.ensureSettings();
    return (row.webAppUrl?.trim() || ENV_WEB_APP).trim();
  }

  private maskToken(token: string): string {
    if (token.length < 12) return '••••••••';
    return `${token.slice(0, 6)}…${token.slice(-4)}`;
  }

  private statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 80) return 'green';
    if (p >= 50) return 'yellow';
    return 'red';
  }

  private serializeChat(c: TelegramReportChat) {
    return {
      id: c.id,
      chatId: c.chatId,
      chatType: c.chatType,
      chatTitle: c.chatTitle,
      peerUsername: c.peerUsername,
      peerFirstName: c.peerFirstName,
      peerLastName: c.peerLastName,
      reportEnabled: c.reportEnabled,
      isActive: c.isActive,
      unreadCount: c.unreadCount,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      startedByUsername: c.startedByUsername,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      displayName:
        c.chatTitle ||
        [c.peerFirstName, c.peerLastName].filter(Boolean).join(' ') ||
        (c.peerUsername ? `@${c.peerUsername}` : `Chat ${c.chatId}`),
    };
  }

  private serializeMessage(m: TelegramChatMessage) {
    return {
      id: m.id,
      chatRowId: m.chatRowId,
      direction: m.direction,
      kind: m.kind,
      telegramMessageId: m.telegramMessageId,
      fromUserId: m.fromUserId,
      fromUsername: m.fromUsername,
      fromName: m.fromName,
      text: m.text,
      caption: m.caption,
      mediaFileId: m.mediaFileId,
      mediaUrl: m.mediaUrl,
      mediaFileName: m.mediaFileName,
      mediaMime: m.mediaMime,
      isCommand: m.isCommand,
      commandName: m.commandName,
      sentByAdminId: m.sentByAdminId,
      createdAt: m.createdAt,
    };
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
