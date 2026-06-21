import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProgress } from '../database/entities/user-progress.entity';
import { HeartsEvents, type HeartsState } from './hearts.events';

const MAX_HEARTS = 5;
const TIMEZONE = 'Asia/Tashkent';

@Injectable()
export class HeartsService {
  constructor(
    @InjectRepository(UserProgress)
    private readonly userProgressRepo: Repository<UserProgress>,
    private readonly heartsEvents: HeartsEvents,
  ) {}

  async getMyHearts(userId: string, organizationId: string): Promise<HeartsState> {
    await this.ensureRow(userId, organizationId);
    await this.regenIfDue(userId, organizationId);
    return this.loadState(userId, organizationId);
  }

  /**
   * Heart kamaytirish. Agar foydalanuvchining hearts = 0 bo'lsa,
   * ForbiddenException tashlanadi — chaqiruvchi shu xatoni 403 ga aylantirib
   * mobile/web tomonga "qulflangan" signalini berishi mumkin.
   *
   * Atomik: regen + decrement + zero-check bir SQL ichida.
   */
  async consumeHeart(
    userId: string,
    organizationId: string,
    amount = 1,
  ): Promise<HeartsState> {
    await this.ensureRow(userId, organizationId);
    await this.regenIfDue(userId, organizationId);

    const dec = Math.max(1, Math.floor(amount));

    // Atomic decrement that fails (0 rows) when there aren't enough hearts.
    const res = await this.userProgressRepo
      .createQueryBuilder()
      .update(UserProgress)
      .set({
        heartsCount: () => `hearts_count - ${dec}`,
      })
      .where('user_id = :userId', { userId })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere(`hearts_count >= ${dec}`)
      .execute();

    if ((res.affected ?? 0) === 0) {
      // Yurak yetmadi — bloklash.
      const state = await this.loadState(userId, organizationId);
      this.heartsEvents.emit(userId, state);
      throw new ForbiddenException({
        code: 'NO_HEARTS_LEFT',
        message: 'Yuraklar tugadi. Ertaga 00:00 dan keyin yangilanadi.',
        state,
      });
    }

    const state = await this.loadState(userId, organizationId);
    this.heartsEvents.emit(userId, state);
    return state;
  }

  /**
   * Har yangi kunda (Toshkent vaqti bo'yicha 00:00 dan keyin) hearts = MAX.
   * Server timezone'iga bog'liq emas — PostgreSQL `AT TIME ZONE` orqali.
   */
  async regenIfDue(userId: string, organizationId: string): Promise<boolean> {
    const res = await this.userProgressRepo
      .createQueryBuilder()
      .update(UserProgress)
      .set({
        heartsCount: MAX_HEARTS,
        lastHeartRegenAt: () => 'NOW()',
      })
      .where('user_id = :userId', { userId })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere(
        `(
          last_heart_regen_at IS NULL
          OR (last_heart_regen_at AT TIME ZONE :tz)::date
             < (NOW() AT TIME ZONE :tz)::date
        )`,
        { tz: TIMEZONE },
      )
      .execute();

    const changed = (res.affected ?? 0) > 0;
    if (changed) {
      const state = await this.loadState(userId, organizationId);
      this.heartsEvents.emit(userId, state);
    }
    return changed;
  }

  /**
   * Race-safe: ikkita parallel request unique violation bermasligi uchun
   * INSERT ... ON CONFLICT DO NOTHING. Unique index migration 0015 da.
   */
  private async ensureRow(userId: string, organizationId: string) {
    await this.userProgressRepo.query(
      `
      INSERT INTO "user_progress"
        ("user_id", "organization_id", "hearts_count",
         "last_heart_regen_at", "current_level_id", "completed_levels_count")
      VALUES ($1, $2, $3, NOW(), NULL, 0)
      ON CONFLICT ("user_id", "organization_id") DO NOTHING
      `,
      [userId, organizationId, MAX_HEARTS],
    );
  }

  private async loadState(userId: string, organizationId: string): Promise<HeartsState> {
    const row = await this.userProgressRepo.findOne({
      where: { userId, organizationId },
    });

    const heartsCount = Math.max(0, Math.min(MAX_HEARTS, row?.heartsCount ?? MAX_HEARTS));
    const last = row?.lastHeartRegenAt ?? null;

    return {
      heartsCount,
      maxHearts: MAX_HEARTS,
      nextRegenAt: this.nextMidnightTashkent().toISOString(),
      lastHeartRegenAt: last ? last.toISOString() : null,
    };
  }

  /**
   * Toshkent (UTC+5) bo'yicha keyingi 00:00 ni ISO formatda qaytaradi.
   * Server timezone'iga bog'liq emas.
   */
  private nextMidnightTashkent(): Date {
    // 5 soat oldinga surilgan "fake-UTC" da kunni belgilab, keyin orqaga
    // qaytariladi. Kuznogi/yozgi vaqt yo'q (UTC+5 doimiy).
    const now = new Date();
    const tashkentNow = new Date(now.getTime() + 5 * 3600 * 1000);
    const next = new Date(
      Date.UTC(
        tashkentNow.getUTCFullYear(),
        tashkentNow.getUTCMonth(),
        tashkentNow.getUTCDate() + 1,
        0,
        0,
        0,
        0,
      ),
    );
    // 00:00 Tashkent = 19:00 oldingi UTC kun
    return new Date(next.getTime() - 5 * 3600 * 1000);
  }
}
