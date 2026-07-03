import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProgress } from '../database/entities/user-progress.entity';
import { HeartsEvents, type HeartsState } from './hearts.events';

const MAX_HEARTS = 5;
/** Har REGEN_INTERVAL_SEC da 1 ta energiya tiklanadi (maksimumgacha). */
const REGEN_INTERVAL_SEC = 60 * 60; // 1 soat

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
   * Energiya kamaytirish. Har bir urinish (to'g'ri yoki noto'g'ri) 1 energiya
   * sarflaydi. Agar energiya yetmasa ForbiddenException tashlanadi — chaqiruvchi
   * shu xatoni 403 ga aylantirib mobile/web tomonga "qulflangan" signalini beradi.
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
    // To'liq holatdan sarflanganda regen taymeri shu paytdan boshlanadi.
    const res = await this.userProgressRepo
      .createQueryBuilder()
      .update(UserProgress)
      .set({
        heartsCount: () => `hearts_count - ${dec}`,
        lastHeartRegenAt: () =>
          `CASE WHEN hearts_count >= ${MAX_HEARTS} THEN NOW() ELSE COALESCE(last_heart_regen_at, NOW()) END`,
      })
      .where('user_id = :userId', { userId })
      .andWhere('organization_id = :organizationId', { organizationId })
      .andWhere(`hearts_count >= ${dec}`)
      .execute();

    if ((res.affected ?? 0) === 0) {
      // Energiya yetmadi — bloklash.
      const state = await this.loadState(userId, organizationId);
      this.heartsEvents.emit(userId, state);
      throw new ForbiddenException({
        code: 'NO_HEARTS_LEFT',
        message: 'Energiya tugadi. Har soatda 1 ta energiya tiklanadi.',
        state,
      });
    }

    const state = await this.loadState(userId, organizationId);
    this.heartsEvents.emit(userId, state);
    return state;
  }

  /**
   * Soatlik regen: o'tgan har bir to'liq interval uchun +1 energiya
   * (MAX_HEARTS gacha). last_heart_regen_at faqat to'liq intervallar
   * hisobiga suriladi — qisman soat yo'qolmaydi. Maksimumga yetganda NOW().
   * Server timezone'iga bog'liq emas — hammasi NOW() farqi orqali.
   */
  async regenIfDue(userId: string, organizationId: string): Promise<boolean> {
    const rows = (await this.userProgressRepo.query(
      `
      UPDATE "user_progress"
      SET
        "hearts_count" = LEAST(
          $3,
          "hearts_count"
            + FLOOR(EXTRACT(EPOCH FROM (NOW() - "last_heart_regen_at")) / $4)::int
        ),
        "last_heart_regen_at" = CASE
          WHEN "hearts_count"
               + FLOOR(EXTRACT(EPOCH FROM (NOW() - "last_heart_regen_at")) / $4)::int
               >= $3
            THEN NOW()
          ELSE "last_heart_regen_at"
               + make_interval(secs =>
                   FLOOR(EXTRACT(EPOCH FROM (NOW() - "last_heart_regen_at")) / $4) * $4)
        END
      WHERE "user_id" = $1
        AND "organization_id" = $2
        AND "hearts_count" < $3
        AND "last_heart_regen_at" IS NOT NULL
        AND NOW() - "last_heart_regen_at" >= make_interval(secs => $4)
      RETURNING "hearts_count"
      `,
      [userId, organizationId, MAX_HEARTS, REGEN_INTERVAL_SEC],
    )) as unknown as [unknown[], number] | unknown[];

    // pg driver UPDATE..RETURNING: TypeORM [rows, affected] qaytaradi.
    const changed = Array.isArray(rows)
      ? Array.isArray(rows[0])
        ? (rows[0] as unknown[]).length > 0
        : rows.length > 0
      : false;

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

    // To'liq bo'lmasa keyingi energiya last + interval da keladi.
    const nextRegenAt =
      heartsCount >= MAX_HEARTS || !last
        ? null
        : new Date(last.getTime() + REGEN_INTERVAL_SEC * 1000).toISOString();

    return {
      heartsCount,
      maxHearts: MAX_HEARTS,
      nextRegenAt,
      lastHeartRegenAt: last ? last.toISOString() : null,
    };
  }
}
