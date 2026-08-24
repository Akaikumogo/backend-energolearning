import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchAnalyticsService } from '../branch-analytics/branch-analytics.service';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import { tashkentToday } from '../common/utils/tashkent-time.util';
import { TelegramReportImageService } from './telegram-report-image.service';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const WEB_APP_URL =
  process.env.TELEGRAM_WEB_APP_URL ?? 'https://t.me/elektrolearnbot/Elektro_learn';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private offset = 0;
  private polling = false;
  private stopRequested = false;
  private sendingReport = false;

  constructor(
    @InjectRepository(TelegramReportChat)
    private readonly chatRepo: Repository<TelegramReportChat>,
    private readonly analytics: BranchAnalyticsService,
    private readonly imageService: TelegramReportImageService,
  ) {}

  async onModuleInit() {
    if (!TELEGRAM_BOT_TOKEN) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN o`rnatilmagan — telegram bot o`chirilgan.',
      );
      return;
    }
    this.logger.log(
      'Telegram bot ishga tushmoqda (hisobot 18:00 Asia/Tashkent)...',
    );
    void this.startPolling();
  }

  onModuleDestroy() {
    this.stopRequested = true;
  }

  /** Har kuni 18:00 (Toshkent) — moderatorlar guruhiga hisobot. */
  @Cron('0 18 * * *', { timeZone: 'Asia/Tashkent' })
  async handleDailyReportCron() {
    if (!TELEGRAM_BOT_TOKEN) return;
    this.logger.log('Kunlik hisobot cron ishga tushdi (18:00 Asia/Tashkent)');
    await this.broadcastDailyReport();
  }

  async broadcastDailyReport() {
    if (this.sendingReport) {
      this.logger.warn('Hisobot yuborish allaqachon davom etmoqda');
      return;
    }
    this.sendingReport = true;
    try {
      const chats = await this.chatRepo.find({ where: { isActive: true } });
      if (!chats.length) {
        this.logger.warn(
          'Faol telegram guruh yo‘q — /start ni moderatorlar guruhida bosing',
        );
        return;
      }

      const { png, caption } = await this.buildReportPayload();
      for (const chat of chats) {
        await this.sendPhoto(Number(chat.chatId), png, caption).catch((err) =>
          this.logger.error(
            `chat ${chat.chatId} ga yuborish xato: ${err?.message || err}`,
          ),
        );
      }
      this.logger.log(`Hisobot ${chats.length} ta guruhga yuborildi`);
    } catch (err: any) {
      this.logger.error(`Hisobot yuborish xato: ${err?.message || err}`);
    } finally {
      this.sendingReport = false;
    }
  }

  private async startPolling() {
    if (this.polling) return;
    this.polling = true;

    while (!this.stopRequested) {
      try {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update).catch((err) =>
            this.logger.error(`Update ishlovida xato: ${err?.message || err}`),
          );
        }
      } catch (err: any) {
        this.logger.error(`Polling xatosi: ${err?.message || err}`);
        await this.sleep(3000);
      }
    }

    this.polling = false;
  }

  private async getUpdates(): Promise<TelegramUpdate[]> {
    const url = `${TELEGRAM_API}/getUpdates?timeout=30&offset=${this.offset}&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.ok) {
      throw new Error(`getUpdates xato: ${JSON.stringify(data)}`);
    }
    return data.result as TelegramUpdate[];
  }

  private async handleUpdate(update: TelegramUpdate) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const text = msg.text.trim();
    const chat = msg.chat;
    const cmd = text.split(/\s+/)[0].split('@')[0].toLowerCase();

    if (cmd === '/start') {
      await this.handleStart(chat, msg.from);
      return;
    }
    if (cmd === '/stop_report') {
      await this.handleStopReport(chat);
      return;
    }
    if (cmd === '/report_now') {
      await this.handleReportNow(chat);
      return;
    }
  }

  private async handleStart(chat: TelegramChat, from?: TelegramUser) {
    const isGroup = chat.type === 'group' || chat.type === 'supergroup';

    if (isGroup) {
      await this.registerReportChat(chat, from);
      await this.sendMessage(
        chat.id,
        `✅ <b>Электро Learn</b> — гуруҳ уланди!\n\n` +
          `Ҳар куни соат <b>18:00</b> (Тошкент) шу гуруҳга:\n` +
          `• GitHub Actions услубидаги ҳисобот расми\n` +
          `• Бугунги ва жорий ой натижалари\n` +
          `• Ҳисобот топшириш эслатмаси\n\n` +
          `Бугунги ҳисоботни дарҳол олиш: /report_now\n` +
          `Ўчириш: /stop_report`,
      );
      return;
    }

    const name = from?.first_name ? `, ${from.first_name}` : '';
    const text =
      `👋 Assalomu alaykum${name}!\n\n` +
      `⚡ <b>Elektro Learn</b> ga xush kelibsiz!\n\n` +
      `Moderatorlar guruhida /start bosing — har kuni 18:00 da hisobot yuboriladi.\n\n` +
      `Quyidagi tugmani bosib web ilovaga kiring 👇`;

    await this.sendMessage(chat.id, text, {
      inline_keyboard: [
        [
          {
            text: '🚀 Elektro Learn Web App ga kirish',
            url: WEB_APP_URL,
          },
        ],
      ],
    });
  }

  private async registerReportChat(chat: TelegramChat, from?: TelegramUser) {
    const existing = await this.chatRepo.findOne({
      where: { chatId: String(chat.id) },
    });
    if (existing) {
      existing.isActive = true;
      existing.chatType = chat.type;
      existing.chatTitle = chat.title ?? existing.chatTitle;
      existing.startedByUserId = from ? String(from.id) : existing.startedByUserId;
      existing.startedByUsername = from?.username ?? existing.startedByUsername;
      await this.chatRepo.save(existing);
      return;
    }
    await this.chatRepo.save(
      this.chatRepo.create({
        chatId: String(chat.id),
        chatType: chat.type,
        chatTitle: chat.title ?? null,
        startedByUserId: from ? String(from.id) : null,
        startedByUsername: from?.username ?? null,
        isActive: true,
      }),
    );
  }

  private async handleStopReport(chat: TelegramChat) {
    const row = await this.chatRepo.findOne({
      where: { chatId: String(chat.id) },
    });
    if (!row) {
      await this.sendMessage(
        chat.id,
        'ℹ️ Бу гуруҳ ҳали уланмаган. Аввал /start босинг.',
      );
      return;
    }
    row.isActive = false;
    await this.chatRepo.save(row);
    await this.sendMessage(
      chat.id,
      '🛑 Кунлик ҳисобот эслатмаси ўчирилди.\nҚайта ёқиш: /start',
    );
  }

  private async handleReportNow(chat: TelegramChat) {
    const isGroup = chat.type === 'group' || chat.type === 'supergroup';
    if (isGroup) {
      await this.registerReportChat(chat);
    }
    await this.sendMessage(chat.id, '⏳ Ҳисобот тайёрланмоқда...');
    try {
      const { png, caption } = await this.buildReportPayload();
      await this.sendPhoto(chat.id, png, caption);
    } catch (err: any) {
      this.logger.error(`report_now xato: ${err?.message || err}`);
      await this.sendMessage(
        chat.id,
        `❌ Ҳисобот юбориб бўлмади: ${err?.message || 'ноноуш хато'}`,
      );
    }
  }

  private async buildReportPayload(): Promise<{
    png: Buffer;
    caption: string;
  }> {
    const planDate = tashkentToday();
    const month = planDate.slice(0, 7);

    const [daily, monthly] = await Promise.all([
      this.analytics.getDailyReport(planDate, null),
      this.analytics.getMonthlyReport(month, null),
    ]);

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
        : 0;

    const png = await this.imageService.buildCombinedReportPng(
      {
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
      },
      {
        month: monthly.month,
        averagePercent: monthlyAvg,
        branchCount: monthly.branches.length,
        branches: monthly.branches.map((b) => ({
          orgName: b.orgName,
          percent: b.averageMonthlyPercent,
          averageMonthlyPercent: b.averageMonthlyPercent,
          status: this.statusFromPercent(b.averageMonthlyPercent),
        })),
      },
    );

    const caption = this.buildCyrillicCaption(daily.planDate, {
      completionPercent: daily.completionPercent,
      completedTotal: daily.completedTotal,
      totalPlan: daily.totalPlan,
      monthlyAvg,
      branchCount: daily.branchCount,
    });

    return { png, caption };
  }

  private buildCyrillicCaption(
    planDate: string,
    stats: {
      completionPercent: number;
      completedTotal: number;
      totalPlan: number;
      monthlyAvg: number;
      branchCount: number;
    },
  ): string {
    const [y, m, d] = planDate.split('-');
    const dateUz = `${d}.${m}.${y}`;
    return (
      `⚡ <b>Электро Learn</b> — кунлик ҳисобот\n\n` +
      `📅 Сана: <b>${dateUz}</b>\n` +
      `🕐 Вақт: <b>18:00</b> (Тошкент)\n\n` +
      `📈 Бугун: <b>${stats.completionPercent.toFixed(1)}%</b> ` +
      `(${stats.completedTotal}/${stats.totalPlan})\n` +
      `🗓 Жорий ой ўртача: <b>${stats.monthlyAvg.toFixed(1)}%</b>\n` +
      `🏢 Филиаллар: <b>${stats.branchCount}</b>\n\n` +
      `❗️ <b>Илтимос, бугунги ҳисоботни топширинг!</b>\n` +
      `Юқоридаги расмда — бугунги ва ойлик натижалар (GitHub Actions услубида).`
    );
  }

  private statusFromPercent(p: number): 'green' | 'yellow' | 'red' {
    if (p >= 80) return 'green';
    if (p >= 50) return 'yellow';
    return 'red';
  }

  private async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: unknown,
  ) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    if (!data.ok) {
      this.logger.error(`sendMessage xato: ${JSON.stringify(data)}`);
    }
  }

  private async sendPhoto(chatId: number, png: Buffer, caption: string) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', 'HTML');
    form.append(
      'photo',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'elektro-learn-report.png',
    );

    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data: any = await res.json();
    if (!data.ok) {
      throw new Error(`sendPhoto xato: ${JSON.stringify(data)}`);
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
