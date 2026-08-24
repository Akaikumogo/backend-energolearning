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
import { Repository } from 'typeorm';
import { BranchAnalyticsService } from '../branch-analytics/branch-analytics.service';
import { tashkentToday } from '../common/utils/tashkent-time.util';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import {
  TelegramChatMessage,
  TelegramMessageKind,
} from '../database/entities/telegram-chat-message.entity';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { TelegramReportImageService } from './telegram-report-image.service';

const ENV_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ENV_WEB_APP =
  process.env.TELEGRAM_WEB_APP_URL ?? 'https://t.me/elektrolearnbot/Elektro_learn';

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
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
  document?: { file_id: string; file_name?: string };
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
    private readonly analytics: BranchAnalyticsService,
    private readonly imageService: TelegramReportImageService,
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
        `Ҳозир олиш: /hisobot`,
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

    if (msg.photo?.length) {
      kind = 'photo';
      mediaFileId = msg.photo[msg.photo.length - 1].file_id;
      text = msg.caption || '📷 Rasm';
    } else if (msg.document) {
      kind = 'document';
      mediaFileId = msg.document.file_id;
      text = msg.caption || `📄 ${msg.document.file_name || 'Fayl'}`;
    } else if (cmd) {
      kind = 'command';
    } else if (!text) {
      kind = 'other';
      text = text || '[media]';
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
        isCommand: !!cmd,
        commandName: cmd,
      }),
    );

    chat.lastMessageAt = new Date();
    chat.lastMessagePreview = preview;
    // Komanda emas — superadmin inbox uchun unread
    if (!cmd) {
      chat.unreadCount = (chat.unreadCount || 0) + 1;
    }
    await this.chatRepo.save(chat);
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
        fromName: opts.sentByAdminId ? 'Superadmin' : 'Bot',
      }),
    );
    chat.lastMessageAt = new Date();
    chat.lastMessagePreview = opts.text.slice(0, 180);
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

    const monthlyAvgFromTrend =
      monthly.trend.length > 0
        ? Math.round(
            (monthly.trend.reduce((s, p) => s + (p.percent ?? 0), 0) /
              monthly.trend.length) *
              10,
          ) / 10
        : 0;

    const monthlyAvg =
      monthly.branches.length > 0
        ? Math.round(
            (monthly.branches.reduce(
              (s, b) => s + (b.averageMonthlyPercent ?? 0),
              0,
            ) /
              monthly.branches.length) *
              10,
          ) / 10
        : monthlyAvgFromTrend;

    const dailyInput = {
      planDate: daily.planDate,
      completionPercent: daily.completionPercent,
      completedTotal: daily.completedTotal,
      totalPlan: daily.totalPlan,
      totalEmployees: daily.totalEmployees,
      completedEmployees: daily.completedEmployees,
      extraCorrectTotal: daily.extraCorrectTotal,
      branchCount: daily.branchCount,
      branches: daily.branches.map((b) => ({
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
      branchCount: monthly.branches.length,
      branches: monthly.branches.map((b) => ({
        orgName: b.orgName,
        percent: b.averageMonthlyPercent,
        averageMonthlyPercent: b.averageMonthlyPercent,
        status: this.statusFromPercent(b.averageMonthlyPercent),
      })),
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

    const [y, m, d] = daily.planDate.split('-');
    const dailyCaption =
      `⚡ <b>Elektro Learn</b> — kunlik hisobot\n\n` +
      `📅 Sana: <b>${d}.${m}.${y}</b>\n` +
      `🕐 Vaqt: <b>18:00</b> (Toshkent)\n\n` +
      `📈 Bugun (umumiy): <b>${daily.completionPercent.toFixed(1)}%</b>\n` +
      `📋 Reja: <b>${daily.completedTotal}/${daily.totalPlan}</b>\n` +
      `🏢 Filiallar: <b>${daily.branchCount}</b>\n\n` +
      `❗️ <b>Iltimos, bugungi hisobotni topshiring!</b>`;

    const [yy, mm] = monthly.month.split('-');
    const monthlyCaption =
      `🗓 <b>Elektro Learn</b> — oylik hisobot\n\n` +
      `📅 Oy: <b>${mm}.${yy}</b>\n` +
      `📊 Kunlik foizlar jadvali + yakuniy umumiy foiz\n\n` +
      `📈 Oylik oʻrtacha: <b>${monthlyAvg.toFixed(1)}%</b>\n` +
      `📆 Kunlar: <b>${monthly.trend.length}</b>`;

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
