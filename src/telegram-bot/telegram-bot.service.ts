import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const WEB_APP_URL =
  process.env.TELEGRAM_WEB_APP_URL ?? 'https://t.me/elektrolearnbot/Elektro_learn';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
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

  async onModuleInit() {
    if (!TELEGRAM_BOT_TOKEN) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN o`rnatilmagan — telegram bot o`chirilgan.',
      );
      return;
    }
    this.logger.log('Telegram bot ishga tushmoqda...');
    void this.startPolling();
  }

  onModuleDestroy() {
    this.stopRequested = true;
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
    const url = `${TELEGRAM_API}/getUpdates?timeout=30&offset=${this.offset}`;
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
    const chatId = msg.chat.id;

    if (text === '/start' || text.startsWith('/start ')) {
      await this.sendStartMessage(chatId, msg.from?.first_name);
    }
  }

  private async sendStartMessage(chatId: number, firstName?: string) {
    const name = firstName ? `, ${firstName}` : '';
    const text =
      `👋 Assalomu alaykum${name}!\n\n` +
      `⚡ <b>Elektro Learn</b> ga xush kelibsiz!\n\n` +
      `Quyidagi tugmani bosib web ilovaga kiring 👇`;

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🚀 Elektro Learn Web App ga kirish',
            url: WEB_APP_URL,
          },
        ],
      ],
    };

    await this.sendMessage(chatId, text, replyMarkup);
  }

  private async sendMessage(chatId: number, text: string, replyMarkup?: unknown) {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    };
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

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
