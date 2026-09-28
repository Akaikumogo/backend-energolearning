import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import { TelegramChatMessage } from '../database/entities/telegram-chat-message.entity';
import {
  TelegramNewsBroadcast,
  TelegramNewsDelivery,
  TelegramNewsDeliveryStatus,
} from '../database/entities/telegram-news.entity';
import { TelegramReportChat } from '../database/entities/telegram-report-chat.entity';
import {
  TELEGRAM_NEWS,
  TelegramNewsItem,
  findTelegramNews,
} from './telegram-news.content';

const ENV_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ENV_WEB_APP =
  process.env.TELEGRAM_WEB_APP_URL ??
  'https://t.me/elektrolearnbot/Elektro_learn';

/** Telegram umumiy limiti ~30 xabar/sek — chatlar orasida kichik pauza. */
const PAUSE_BETWEEN_MESSAGES_MS = 60;
const MAX_RETRIES_ON_429 = 3;

class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

@Injectable()
export class TelegramNewsService {
  private readonly logger = new Logger(TelegramNewsService.name);
  private readonly running = new Set<string>();
  private readonly pngCache = new Map<string, Buffer>();
  /** Birinchi yuklangan rasmning Telegram file_id si — qayta yuklamaslik uchun. */
  private readonly fileIdCache = new Map<string, string>();

  constructor(
    @InjectRepository(TelegramReportChat)
    private readonly chatRepo: Repository<TelegramReportChat>,
    @InjectRepository(TelegramChatMessage)
    private readonly msgRepo: Repository<TelegramChatMessage>,
    @InjectRepository(TelegramBotSetting)
    private readonly settingsRepo: Repository<TelegramBotSetting>,
    @InjectRepository(TelegramNewsBroadcast)
    private readonly broadcastRepo: Repository<TelegramNewsBroadcast>,
    @InjectRepository(TelegramNewsDelivery)
    private readonly deliveryRepo: Repository<TelegramNewsDelivery>,
  ) {}

  // ─── public API ──────────────────────────────────────────

  async list() {
    const recipients = await this.recipientsQuery().getCount();
    const items: unknown[] = [];
    for (const news of TELEGRAM_NEWS) {
      items.push(await this.describe(news, recipients));
    }
    return { recipients, items };
  }

  async previewPng(key: string, index: number): Promise<Buffer> {
    const news = this.requireNews(key);
    if (!Number.isInteger(index) || index < 0 || index >= news.slides.length) {
      throw new NotFoundException('Slayd topilmadi');
    }
    return this.slidePng(news, index);
  }

  async sendTest(key: string, chatRowId: string, actorId: string) {
    const news = this.requireNews(key);
    const chat = await this.chatRepo.findOne({ where: { id: chatRowId } });
    if (!chat) throw new NotFoundException('Chat topilmadi');

    const row = await this.broadcastRepo.save(
      this.broadcastRepo.create({
        newsKey: news.key,
        mode: 'TEST',
        status: 'RUNNING',
        testChatRowId: chat.id,
        total: 1,
        startedById: actorId,
      }),
    );
    try {
      await this.deliver(news, chat);
      await this.markDelivery(news.key, chat.id, row.id, 'SENT', null);
      row.sent = 1;
      row.status = 'DONE';
    } catch (err) {
      row.failed = 1;
      row.status = 'FAILED';
      row.error = this.errorText(err);
    }
    row.finishedAt = new Date();
    await this.broadcastRepo.save(row);
    if (row.status === 'FAILED') {
      throw new BadRequestException(`Yuborilmadi: ${row.error}`);
    }
    return { ok: true };
  }

  async startBroadcast(key: string, actorId: string) {
    const news = this.requireNews(key);
    if (this.running.has(news.key)) {
      throw new ConflictException('Bu yangilik hozir yuborilmoqda');
    }
    const tested = await this.broadcastRepo.count({
      where: { newsKey: news.key, mode: 'TEST', status: 'DONE' },
    });
    if (!tested) {
      throw new BadRequestException(
        'Avval oʻzingizga test yuboring, keyin hammaga yuborish mumkin',
      );
    }
    const pending = await this.pendingChats(news.key);
    if (!pending.length) {
      throw new BadRequestException(
        'Hamma chatlarga allaqachon yuborilgan — qayta yuborilmaydi',
      );
    }

    this.running.add(news.key);
    const row = await this.broadcastRepo.save(
      this.broadcastRepo.create({
        newsKey: news.key,
        mode: 'ALL',
        status: 'RUNNING',
        total: pending.length,
        startedById: actorId,
      }),
    );
    void this.runBroadcast(news, row, pending).finally(() =>
      this.running.delete(news.key),
    );
    return { ok: true, broadcastId: row.id, total: pending.length };
  }

  // ─── broadcast ───────────────────────────────────────────

  private async runBroadcast(
    news: TelegramNewsItem,
    row: TelegramNewsBroadcast,
    chats: TelegramReportChat[],
  ) {
    try {
      for (const chat of chats) {
        try {
          await this.deliver(news, chat);
          await this.markDelivery(news.key, chat.id, row.id, 'SENT', null);
          row.sent += 1;
        } catch (err) {
          const msg = this.errorText(err);
          if (this.isBlockedError(err)) {
            row.blocked += 1;
            await this.markDelivery(news.key, chat.id, row.id, 'BLOCKED', msg);
            chat.isActive = false;
            chat.reportEnabled = false;
            await this.chatRepo.save(chat).catch(() => undefined);
          } else {
            row.failed += 1;
            await this.markDelivery(news.key, chat.id, row.id, 'FAILED', msg);
            this.logger.warn(`news ${news.key} → chat ${chat.chatId}: ${msg}`);
          }
        }
        if ((row.sent + row.failed + row.blocked) % 20 === 0) {
          await this.broadcastRepo.save(row).catch(() => undefined);
        }
      }
      row.status = 'DONE';
    } catch (err) {
      row.status = 'FAILED';
      row.error = this.errorText(err);
      this.logger.error(`news ${news.key} broadcast: ${row.error}`);
    } finally {
      row.finishedAt = new Date();
      await this.broadcastRepo.save(row).catch(() => undefined);
      this.logger.log(
        `news ${news.key}: ${row.sent} yuborildi, ${row.blocked} block, ${row.failed} xato`,
      );
    }
  }

  private async deliver(news: TelegramNewsItem, chat: TelegramReportChat) {
    const webApp = await this.resolveWebAppUrl();
    const last = news.slides.length - 1;
    for (let i = 0; i <= last; i++) {
      const slide = news.slides[i];
      const replyMarkup =
        i === last
          ? {
              inline_keyboard: [
                [{ text: '🚀 Elektro Learn ilovasini ochish', url: webApp }],
              ],
            }
          : undefined;
      const sent = await this.sendPhotoWithRetry(
        news,
        i,
        Number(chat.chatId),
        slide.caption,
        replyMarkup,
      );
      await this.persistOutbound(news, i, chat, slide.caption, sent);
      await this.sleep(PAUSE_BETWEEN_MESSAGES_MS);
    }
  }

  private async sendPhotoWithRetry(
    news: TelegramNewsItem,
    index: number,
    chatId: number,
    caption: string,
    replyMarkup?: unknown,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.apiSendPhoto(news, index, chatId, caption, replyMarkup);
      } catch (err) {
        if (
          err instanceof TelegramApiError &&
          err.code === 429 &&
          attempt < MAX_RETRIES_ON_429
        ) {
          await this.sleep(((err.retryAfter ?? 3) + 1) * 1000);
          continue;
        }
        throw err;
      }
    }
  }

  private async apiSendPhoto(
    news: TelegramNewsItem,
    index: number,
    chatId: number,
    caption: string,
    replyMarkup?: unknown,
  ): Promise<{ message_id?: number } | null> {
    const token = await this.resolveToken();
    if (!token) throw new BadRequestException('Bot token oʻrnatilmagan');

    const cacheKey = `${news.key}:${index}`;
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('caption', caption.slice(0, 1024));
    form.append('parse_mode', 'HTML');
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const fileId = this.fileIdCache.get(cacheKey);
    if (fileId) {
      form.append('photo', fileId);
    } else {
      const png = await this.slidePng(news, index);
      form.append(
        'photo',
        new Blob([new Uint8Array(png)], { type: 'image/png' }),
        `${news.key}-${index + 1}.png`,
      );
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      body: form,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data?.ok) {
      throw new TelegramApiError(
        data?.description || `HTTP ${res.status}`,
        data?.error_code ?? res.status ?? null,
        data?.parameters?.retry_after ?? null,
      );
    }
    const photos: Array<{ file_id?: string }> = data.result?.photo ?? [];
    const biggest = photos[photos.length - 1]?.file_id;
    if (biggest && !fileId) this.fileIdCache.set(cacheKey, biggest);
    return data.result ?? null;
  }

  private async persistOutbound(
    news: TelegramNewsItem,
    index: number,
    chat: TelegramReportChat,
    caption: string,
    sent: { message_id?: number } | null,
  ) {
    const mediaUrl = await this.ensureStoredSlide(news, index).catch(
      () => null,
    );
    await this.msgRepo
      .save(
        this.msgRepo.create({
          chatRowId: chat.id,
          direction: 'out',
          kind: 'photo',
          telegramMessageId:
            sent?.message_id != null ? String(sent.message_id) : null,
          text: '📰 Yangilik',
          caption: this.stripHtml(caption),
          mediaUrl,
          mediaFileName: `${news.key}-${index + 1}.png`,
          mediaMime: 'image/png',
          isCommand: false,
          sentByAdminId: null,
          fromName: 'Bot',
        }),
      )
      .catch((err) =>
        this.logger.warn(`news history save: ${this.errorText(err)}`),
      );
  }

  // ─── helpers ─────────────────────────────────────────────

  private async describe(news: TelegramNewsItem, recipients: number) {
    const counts = await this.deliveryRepo
      .createQueryBuilder('d')
      .innerJoin(TelegramReportChat, 'c', 'c.id = d.chat_row_id')
      .select('d.status', 'status')
      .addSelect('COUNT(*)::int', 'cnt')
      .where('d.news_key = :key', { key: news.key })
      .groupBy('d.status')
      .getRawMany<{ status: TelegramNewsDeliveryStatus; cnt: number }>();
    const byStatus = (s: TelegramNewsDeliveryStatus) =>
      Number(counts.find((c) => c.status === s)?.cnt ?? 0);

    const history = await this.broadcastRepo.query(
      `SELECT b.id, b.mode, b.status, b.total, b.sent, b.failed, b.blocked, b.error,
              b.started_at AS "startedAt", b.finished_at AS "finishedAt",
              NULLIF(CONCAT_WS(' ', u.last_name, u.first_name), '') AS "startedBy",
              COALESCE(c.chat_title,
                       NULLIF(CONCAT_WS(' ', c.peer_first_name, c.peer_last_name), ''),
                       '@' || c.peer_username) AS "testChatName"
         FROM telegram_news_broadcasts b
         LEFT JOIN users u ON u.id = b.started_by_id
         LEFT JOIN telegram_report_chats c ON c.id = b.test_chat_row_id
        WHERE b.news_key = $1
        ORDER BY b.started_at DESC
        LIMIT 20`,
      [news.key],
    );
    const pending = await this.recipientsQuery()
      .andWhere(this.notDeliveredSql(), { key: news.key })
      .getCount();
    const hasSuccessfulTest = history.some(
      (h: { mode: string; status: string }) =>
        h.mode === 'TEST' && h.status === 'DONE',
    );

    return {
      key: news.key,
      title: news.title,
      description: news.description,
      slides: news.slides.length,
      recipients,
      sent: byStatus('SENT'),
      blocked: byStatus('BLOCKED'),
      failed: byStatus('FAILED'),
      pending,
      running: this.running.has(news.key),
      hasSuccessfulTest,
      history,
    };
  }

  /** Faqat shaxsiy chatlar (botga /start bosgan userlar); guruhlar kirmaydi. */
  private recipientsQuery() {
    return this.chatRepo
      .createQueryBuilder('c')
      .where('c.chat_type = :type', { type: 'private' })
      .andWhere('c.is_active = true');
  }

  private notDeliveredSql() {
    return `NOT EXISTS (
      SELECT 1 FROM telegram_news_deliveries d
       WHERE d.news_key = :key AND d.chat_row_id = c.id
         AND d.status IN ('SENT', 'BLOCKED')
    )`;
  }

  private pendingChats(key: string) {
    return this.recipientsQuery()
      .andWhere(this.notDeliveredSql(), { key })
      .orderBy('c.created_at', 'ASC')
      .getMany();
  }

  private async markDelivery(
    key: string,
    chatRowId: string,
    broadcastId: string,
    status: TelegramNewsDeliveryStatus,
    error: string | null,
  ) {
    await this.deliveryRepo.query(
      `INSERT INTO telegram_news_deliveries (news_key, chat_row_id, broadcast_id, status, error)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (news_key, chat_row_id)
       DO UPDATE SET broadcast_id = EXCLUDED.broadcast_id,
                     status = EXCLUDED.status,
                     error = EXCLUDED.error,
                     created_at = now()`,
      [key, chatRowId, broadcastId, status, error],
    );
  }

  private requireNews(key: string): TelegramNewsItem {
    const news = findTelegramNews(key);
    if (!news) throw new NotFoundException('Yangilik topilmadi');
    return news;
  }

  private async slidePng(news: TelegramNewsItem, index: number) {
    const cacheKey = `${news.key}:${index}`;
    const cached = this.pngCache.get(cacheKey);
    if (cached) return cached;
    const png = await sharp(Buffer.from(news.slides[index].svg()))
      .png()
      .toBuffer();
    this.pngCache.set(cacheKey, png);
    return png;
  }

  private async ensureStoredSlide(news: TelegramNewsItem, index: number) {
    const filename = `news-${news.key}-${index + 1}.png`;
    const absDir = join(process.cwd(), 'uploads', 'telegram');
    const absPath = join(absDir, filename);
    try {
      await fs.access(absPath);
    } catch {
      await fs.mkdir(absDir, { recursive: true });
      await fs.writeFile(absPath, await this.slidePng(news, index));
    }
    return `/uploads/telegram/${filename}`;
  }

  private isBlockedError(err: unknown): boolean {
    const msg = this.errorText(err);
    const code = err instanceof TelegramApiError ? err.code : null;
    return (
      (code === 403 || code === 400 || /403/.test(msg)) &&
      /blocked by the user|user is deactivated|chat not found|bot was kicked/i.test(
        msg,
      )
    );
  }

  private errorText(err: unknown): string {
    return String((err as Error)?.message || err || 'Nomaʼlum xato').slice(
      0,
      500,
    );
  }

  private stripHtml(s: string) {
    return s.replace(/<[^>]+>/g, '');
  }

  private async resolveToken(): Promise<string | null> {
    const row = await this.settingsRepo.findOne({
      where: { source: 'default' },
    });
    const token = (row?.botToken?.trim() || ENV_TOKEN || '').trim();
    return token || null;
  }

  private async resolveWebAppUrl(): Promise<string> {
    const row = await this.settingsRepo.findOne({
      where: { source: 'default' },
    });
    return (row?.webAppUrl?.trim() || ENV_WEB_APP).trim();
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
