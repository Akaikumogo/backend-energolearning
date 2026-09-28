import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { Repository } from 'typeorm';
import { TelegramBotSetting } from '../database/entities/telegram-bot-setting.entity';
import {
  TelegramChatMessage,
  TelegramMessageKind,
} from '../database/entities/telegram-chat-message.entity';
import {
  TelegramNewsBroadcast,
  TelegramNewsDelivery,
  TelegramNewsDeliveryStatus,
  TelegramNewsImage,
  TelegramNewsPost,
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

/** Telegram umumiy limiti ~30 xabar/sek — xabarlar orasida kichik pauza. */
const PAUSE_BETWEEN_MESSAGES_MS = 60;
const MAX_RETRIES_ON_429 = 3;
const CAPTION_LIMIT = 1024;
const MESSAGE_LIMIT = 4096;
export const MAX_NEWS_IMAGES = 10;
const MAX_BODY_LENGTH = 4000;
const POST_KEY_PREFIX = 'post-';
const NEWS_UPLOAD_DIR = 'telegram-news';
const APP_BUTTON_TEXT = '🚀 Elektro Learn ilovasini ochish';

class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

type NewsRef =
  | { kind: 'builtin'; key: string; title: string; item: TelegramNewsItem }
  | { kind: 'post'; key: string; title: string; post: TelegramNewsPost };

type PhotoSource = {
  cacheKey: string;
  fileName: string;
  mime: string;
  load: () => Promise<Buffer>;
  /** Chat tarixida ko'rsatish uchun `/uploads/...` */
  storedUrl: () => Promise<string | null>;
};

type SentMessage = { message_id?: number; photo?: Array<{ file_id?: string }> };

export type TelegramNewsPostInput = {
  title?: string;
  body?: string;
  withAppButton?: string | boolean;
  /** Tahrirlashda saqlab qolinadigan rasmlar (JSON massiv: url lar). */
  keepImages?: string;
};

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
    @InjectRepository(TelegramNewsPost)
    private readonly postRepo: Repository<TelegramNewsPost>,
  ) {}

  // ─── ro'yxat / preview ───────────────────────────────────

  async list() {
    const recipients = await this.recipientsQuery().getCount();
    const posts = await this.postRepo.query(
      `SELECT p.id, NULLIF(CONCAT_WS(' ', u.last_name, u.first_name), '') AS "createdBy"
         FROM telegram_news_posts p
         LEFT JOIN users u ON u.id = p.created_by_id`,
    );
    const creators = new Map<string, string | null>(
      posts.map((p: { id: string; createdBy: string | null }) => [p.id, p.createdBy]),
    );
    const rows = await this.postRepo.find({ order: { createdAt: 'DESC' } });

    const items: unknown[] = [];
    for (const post of rows) {
      items.push({
        ...(await this.describe(this.postRef(post), recipients)),
        builtin: false,
        postId: post.id,
        body: post.body,
        images: post.images,
        withAppButton: post.withAppButton,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        createdBy: creators.get(post.id) ?? null,
      });
    }
    for (const item of TELEGRAM_NEWS) {
      items.push({
        ...(await this.describe(this.builtinRef(item), recipients)),
        builtin: true,
        postId: null,
        body: null,
        images: [],
        withAppButton: true,
        description: item.description,
        createdAt: null,
        updatedAt: null,
        createdBy: null,
      });
    }
    return { recipients, items };
  }

  async previewPng(key: string, index: number): Promise<Buffer> {
    const news = findTelegramNews(key);
    if (!news) throw new NotFoundException('Yangilik topilmadi');
    if (!Number.isInteger(index) || index < 0 || index >= news.slides.length) {
      throw new NotFoundException('Slayd topilmadi');
    }
    return this.slidePng(news, index);
  }

  // ─── custom news CRUD ────────────────────────────────────

  async createPost(
    input: TelegramNewsPostInput,
    files: Express.Multer.File[],
    actorId: string,
  ) {
    const { title, body, withAppButton } = this.validateInput(input);
    this.assertImageCount(files.length);
    if (!body && !files.length) {
      throw new BadRequestException('Matn yoki kamida bitta rasm kerak');
    }
    const images = await this.storeImages(files);
    const post = await this.postRepo.save(
      this.postRepo.create({
        title,
        body,
        images,
        withAppButton,
        createdById: actorId,
        updatedById: actorId,
      }),
    );
    return { ok: true, id: post.id, key: this.postKey(post.id) };
  }

  async updatePost(
    id: string,
    input: TelegramNewsPostInput,
    files: Express.Multer.File[],
    actorId: string,
  ) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('News topilmadi');
    if (this.running.has(this.postKey(id))) {
      throw new ConflictException('News hozir yuborilmoqda — keyinroq tahrirlang');
    }
    const { title, body, withAppButton } = this.validateInput(input);

    let keep = post.images;
    if (input.keepImages != null) {
      let urls: unknown;
      try {
        urls = JSON.parse(input.keepImages);
      } catch {
        throw new BadRequestException('keepImages JSON massiv bo‘lishi kerak');
      }
      const wanted = Array.isArray(urls) ? urls.map(String) : [];
      keep = wanted
        .map((u) => post.images.find((img) => img.url === u))
        .filter((img): img is TelegramNewsImage => !!img);
    }
    this.assertImageCount(keep.length + files.length);
    if (!body && !keep.length && !files.length) {
      throw new BadRequestException('Matn yoki kamida bitta rasm kerak');
    }

    const removed = post.images.filter((img) => !keep.some((k) => k.url === img.url));
    const added = await this.storeImages(files);
    post.title = title;
    post.body = body;
    post.withAppButton = withAppButton;
    post.images = [...keep, ...added];
    post.updatedById = actorId;
    await this.postRepo.save(post);
    await this.removeImageFiles(removed);
    return { ok: true };
  }

  async deletePost(id: string) {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('News topilmadi');
    const key = this.postKey(id);
    if (this.running.has(key)) {
      throw new ConflictException('News hozir yuborilmoqda');
    }
    await this.deliveryRepo.delete({ newsKey: key });
    await this.broadcastRepo.delete({ newsKey: key });
    await this.postRepo.delete({ id });
    await this.removeImageFiles(post.images);
    return { ok: true };
  }

  // ─── yuborish ────────────────────────────────────────────

  /** Bitta chatga (o'ziga test yoki biror odamga) yuborish. */
  async sendToChat(key: string, chatRowId: string, actorId: string) {
    const news = await this.requireNews(key);
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
    const news = await this.requireNews(key);
    if (this.running.has(news.key)) {
      throw new ConflictException('Bu news hozir yuborilmoqda');
    }
    const tested = await this.broadcastRepo.count({
      where: { newsKey: news.key, mode: 'TEST', status: 'DONE' },
    });
    if (!tested) {
      throw new BadRequestException(
        'Avval oʻzingizga yuborib koʻring, keyin hammaga yuborish mumkin',
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

  private async runBroadcast(
    news: NewsRef,
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

  private async deliver(news: NewsRef, chat: TelegramReportChat) {
    if (news.kind === 'builtin') return this.deliverBuiltin(news, chat);
    return this.deliverPost(news, chat);
  }

  private async deliverBuiltin(
    news: Extract<NewsRef, { kind: 'builtin' }>,
    chat: TelegramReportChat,
  ) {
    const markup = await this.appButtonMarkup();
    const last = news.item.slides.length - 1;
    for (let i = 0; i <= last; i++) {
      const slide = news.item.slides[i];
      const photo = this.builtinPhoto(news.item, i);
      const sent = await this.withRetry(() =>
        this.apiSendPhoto(Number(chat.chatId), photo, slide.caption, i === last ? markup : undefined),
      );
      await this.persistOutbound(chat, 'photo', slide.caption, sent, photo);
      await this.sleep(PAUSE_BETWEEN_MESSAGES_MS);
    }
  }

  private async deliverPost(
    news: Extract<NewsRef, { kind: 'post' }>,
    chat: TelegramReportChat,
  ) {
    const { post } = news;
    const chatId = Number(chat.chatId);
    const text = this.escapeHtml(post.body.trim());
    const markup = post.withAppButton ? await this.appButtonMarkup() : undefined;
    const photos = post.images.map((img) => this.postPhoto(news.key, img));

    if (!photos.length) {
      const sent = await this.withRetry(() => this.apiSendMessage(chatId, text, markup));
      await this.persistOutbound(chat, 'text', text, sent, null);
      return;
    }

    if (photos.length === 1) {
      const fits = text.length <= CAPTION_LIMIT;
      const sent = await this.withRetry(() =>
        this.apiSendPhoto(chatId, photos[0], fits ? text : null, fits ? markup : undefined),
      );
      await this.persistOutbound(chat, 'photo', fits ? text : '', sent, photos[0]);
      if (!fits) {
        await this.sleep(PAUSE_BETWEEN_MESSAGES_MS);
        const msg = await this.withRetry(() => this.apiSendMessage(chatId, text, markup));
        await this.persistOutbound(chat, 'text', text, msg, null);
      }
      return;
    }

    // Albom: matn sig'sa va tugma kerak bo'lmasa — birinchi rasm captioni,
    // aks holda albomdan keyin alohida xabar (tugma faqat xabarga qo'yiladi).
    const captionInAlbum = !!text && text.length <= CAPTION_LIMIT && !markup;
    const sentList = await this.withRetry(() =>
      this.apiSendMediaGroup(chatId, photos, captionInAlbum ? text : null),
    );
    for (let i = 0; i < photos.length; i++) {
      await this.persistOutbound(
        chat,
        'photo',
        i === 0 && captionInAlbum ? text : '',
        sentList[i] ?? null,
        photos[i],
      );
    }
    if (!captionInAlbum && (text || markup)) {
      await this.sleep(PAUSE_BETWEEN_MESSAGES_MS);
      const body = text || '👆 Elektro Learn yangiliklari';
      const msg = await this.withRetry(() => this.apiSendMessage(chatId, body, markup));
      await this.persistOutbound(chat, 'text', body, msg, null);
    }
  }

  // ─── Telegram API ────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
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

  private async callApi(method: string, body: FormData | Record<string, unknown>) {
    const token = await this.resolveToken();
    if (!token) throw new BadRequestException('Bot token oʻrnatilmagan');
    const isForm = body instanceof FormData;
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data?.ok) {
      throw new TelegramApiError(
        data?.description || `HTTP ${res.status}`,
        data?.error_code ?? res.status ?? null,
        data?.parameters?.retry_after ?? null,
      );
    }
    return data.result;
  }

  private async apiSendMessage(chatId: number, text: string, replyMarkup?: unknown) {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: text.slice(0, MESSAGE_LIMIT),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    return (await this.callApi('sendMessage', body)) as SentMessage;
  }

  private async apiSendPhoto(
    chatId: number,
    photo: PhotoSource,
    caption: string | null,
    replyMarkup?: unknown,
  ) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) {
      form.append('caption', caption.slice(0, CAPTION_LIMIT));
      form.append('parse_mode', 'HTML');
    }
    if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
    const cached = this.fileIdCache.get(photo.cacheKey);
    if (cached) {
      form.append('photo', cached);
    } else {
      form.append('photo', await this.photoBlob(photo), photo.fileName);
    }
    const sent = (await this.callApi('sendPhoto', form)) as SentMessage;
    this.rememberFileId(photo, sent);
    return sent;
  }

  private async apiSendMediaGroup(
    chatId: number,
    photos: PhotoSource[],
    caption: string | null,
  ) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    const media: Record<string, unknown>[] = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const cached = this.fileIdCache.get(photo.cacheKey);
      const item: Record<string, unknown> = { type: 'photo' };
      if (cached) {
        item.media = cached;
      } else {
        const field = `file${i}`;
        form.append(field, await this.photoBlob(photo), photo.fileName);
        item.media = `attach://${field}`;
      }
      if (i === 0 && caption) {
        item.caption = caption.slice(0, CAPTION_LIMIT);
        item.parse_mode = 'HTML';
      }
      media.push(item);
    }
    form.append('media', JSON.stringify(media));
    const sent = (await this.callApi('sendMediaGroup', form)) as SentMessage[];
    sent.forEach((msg, i) => photos[i] && this.rememberFileId(photos[i], msg));
    return sent;
  }

  private async photoBlob(photo: PhotoSource) {
    const buf = await photo.load();
    return new Blob([new Uint8Array(buf)], { type: photo.mime });
  }

  private rememberFileId(photo: PhotoSource, sent: SentMessage | null) {
    const sizes = sent?.photo ?? [];
    const fileId = sizes[sizes.length - 1]?.file_id;
    if (fileId && !this.fileIdCache.has(photo.cacheKey)) {
      this.fileIdCache.set(photo.cacheKey, fileId);
    }
  }

  private async persistOutbound(
    chat: TelegramReportChat,
    kind: TelegramMessageKind,
    htmlText: string,
    sent: SentMessage | null,
    photo: PhotoSource | null,
  ) {
    const mediaUrl = photo ? await photo.storedUrl().catch(() => null) : null;
    const plain = this.stripHtml(htmlText);
    await this.msgRepo
      .save(
        this.msgRepo.create({
          chatRowId: chat.id,
          direction: 'out',
          kind,
          telegramMessageId:
            sent?.message_id != null ? String(sent.message_id) : null,
          text: photo ? '📰 News' : plain,
          caption: photo ? plain || null : null,
          mediaUrl,
          mediaFileName: photo?.fileName ?? null,
          mediaMime: photo?.mime ?? null,
          isCommand: false,
          sentByAdminId: null,
          fromName: 'Bot',
        }),
      )
      .catch((err) =>
        this.logger.warn(`news history save: ${this.errorText(err)}`),
      );
  }

  // ─── news manbalari ──────────────────────────────────────

  private builtinRef(item: TelegramNewsItem): NewsRef {
    return { kind: 'builtin', key: item.key, title: item.title, item };
  }

  private postRef(post: TelegramNewsPost): NewsRef {
    return { kind: 'post', key: this.postKey(post.id), title: post.title, post };
  }

  private postKey(id: string) {
    return `${POST_KEY_PREFIX}${id}`;
  }

  private async requireNews(key: string): Promise<NewsRef> {
    const builtin = findTelegramNews(key);
    if (builtin) return this.builtinRef(builtin);
    if (key.startsWith(POST_KEY_PREFIX)) {
      const id = key.slice(POST_KEY_PREFIX.length);
      if (/^[0-9a-f-]{36}$/i.test(id)) {
        const post = await this.postRepo.findOne({ where: { id } });
        if (post) return this.postRef(post);
      }
    }
    throw new NotFoundException('News topilmadi');
  }

  private builtinPhoto(item: TelegramNewsItem, index: number): PhotoSource {
    return {
      cacheKey: `${item.key}:${index}`,
      fileName: `${item.key}-${index + 1}.png`,
      mime: 'image/png',
      load: () => this.slidePng(item, index),
      storedUrl: () => this.ensureStoredSlide(item, index),
    };
  }

  private postPhoto(key: string, img: TelegramNewsImage): PhotoSource {
    return {
      cacheKey: `${key}:${img.url}`,
      fileName: img.fileName || 'news.jpg',
      mime: 'image/jpeg',
      load: () => fs.readFile(this.absUploadPath(img.url)),
      storedUrl: async () => img.url,
    };
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

  // ─── rasm fayllari ───────────────────────────────────────

  private async storeImages(files: Express.Multer.File[]): Promise<TelegramNewsImage[]> {
    if (!files.length) return [];
    const absDir = join(process.cwd(), 'uploads', NEWS_UPLOAD_DIR);
    await fs.mkdir(absDir, { recursive: true });
    const out: TelegramNewsImage[] = [];
    for (const file of files) {
      let jpeg: Buffer;
      try {
        jpeg = await sharp(file.buffer)
          .rotate()
          .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 88 })
          .toBuffer();
      } catch {
        throw new BadRequestException(`Rasmni o‘qib bo‘lmadi: ${file.originalname}`);
      }
      const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.jpg`;
      await fs.writeFile(join(absDir, filename), jpeg);
      const base = (file.originalname || 'news').replace(/\.[^.]+$/, '');
      out.push({
        url: `/uploads/${NEWS_UPLOAD_DIR}/${filename}`,
        fileName: `${base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 80) || 'news'}.jpg`,
      });
    }
    return out;
  }

  private async removeImageFiles(images: TelegramNewsImage[]) {
    for (const img of images) {
      await fs.unlink(this.absUploadPath(img.url)).catch(() => undefined);
    }
  }

  private absUploadPath(url: string) {
    const rel = url.replace(/^\/+/, '');
    if (!rel.startsWith(`uploads/${NEWS_UPLOAD_DIR}/`) || rel.includes('..')) {
      throw new BadRequestException('Noto‘g‘ri rasm manzili');
    }
    return join(process.cwd(), rel);
  }

  private validateInput(input: TelegramNewsPostInput) {
    const title = String(input.title ?? '').trim();
    const body = String(input.body ?? '').replace(/\r\n/g, '\n').trim();
    if (!title) throw new BadRequestException('Sarlavha kiritilmagan');
    if (title.length > 200) throw new BadRequestException('Sarlavha 200 belgidan oshmasin');
    if (body.length > MAX_BODY_LENGTH) {
      throw new BadRequestException(`Matn ${MAX_BODY_LENGTH} belgidan oshmasin`);
    }
    const flag = input.withAppButton;
    const withAppButton = flag == null ? true : flag === true || flag === 'true';
    return { title, body, withAppButton };
  }

  private assertImageCount(n: number) {
    if (n > MAX_NEWS_IMAGES) {
      throw new BadRequestException(`Ko‘pi bilan ${MAX_NEWS_IMAGES} ta rasm`);
    }
  }

  // ─── statistika ──────────────────────────────────────────

  private async describe(news: NewsRef, recipients: number) {
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
      description: '',
      slides: news.kind === 'builtin' ? news.item.slides.length : news.post.images.length,
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

  // ─── helpers ─────────────────────────────────────────────

  private async appButtonMarkup() {
    const url = await this.resolveWebAppUrl();
    return { inline_keyboard: [[{ text: APP_BUTTON_TEXT, url }]] };
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

  private escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private stripHtml(s: string) {
    return s
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
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
