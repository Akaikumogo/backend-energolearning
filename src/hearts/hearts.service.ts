import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProgress } from '../database/entities/user-progress.entity';
import { HeartsEvents, type HeartsState } from './hearts.events';

const MAX_HEARTS = 5;
// Daily reset: har kuni 00:00 dan keyin bir marta 5 taga reset (kechagi qolgani ahamiyatsiz).
// Server timezone bo'yicha.

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
    const state = await this.loadState(userId, organizationId);
    return state;
  }

  async consumeHeart(
    userId: string,
    organizationId: string,
    amount = 1,
  ): Promise<HeartsState> {
    await this.ensureRow(userId, organizationId);
    await this.regenIfDue(userId, organizationId);

    await this.userProgressRepo
      .createQueryBuilder()
      .update(UserProgress)
      .set({
        heartsCount: () =>
          `GREATEST(0, hearts_count - ${Math.max(1, Math.floor(amount))})`,
      })
      .where('user_id = :userId', { userId })
      .andWhere('organization_id = :organizationId', { organizationId })
      .execute();

    const state = await this.loadState(userId, organizationId);
    this.heartsEvents.emit(userId, state);
    return state;
  }

  async regenIfDue(userId: string, organizationId: string): Promise<boolean> {
    // Rule: har yangi kunda (00:00 dan keyin) heartsCount = 5 bo'ladi.
    // last_heart_regen_at bugungi kun boshlanishidan oldin bo'lsa -> reset.
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
        `(last_heart_regen_at IS NULL OR last_heart_regen_at < date_trunc('day', NOW()))`,
      )
      .execute();

    const changed = (res.affected ?? 0) > 0;
    if (changed) {
      const state = await this.loadState(userId, organizationId);
      this.heartsEvents.emit(userId, state);
    }
    return changed;
  }

  private async ensureRow(userId: string, organizationId: string) {
    const existing = await this.userProgressRepo.findOne({
      where: { userId, organizationId },
    });
    if (existing) return;

    const row = this.userProgressRepo.create({
      userId,
      organizationId,
      heartsCount: MAX_HEARTS,
      lastHeartRegenAt: new Date(),
      currentLevelId: null,
      completedLevelsCount: 0,
    });
    await this.userProgressRepo.save(row);
  }

  private async loadState(userId: string, organizationId: string): Promise<HeartsState> {
    const row = await this.userProgressRepo.findOne({
      where: { userId, organizationId },
    });

    const heartsCount = Math.max(0, Math.min(MAX_HEARTS, row?.heartsCount ?? MAX_HEARTS));
    const last = row?.lastHeartRegenAt ?? null;
    const nextRegenAt = new Date(
      new Date().setHours(24, 0, 0, 0),
    ).toISOString();

    return {
      heartsCount,
      maxHearts: MAX_HEARTS,
      nextRegenAt,
      lastHeartRegenAt: last ? last.toISOString() : null,
    };
  }
}

