import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyPlan } from '../database/entities/daily-plan.entity';
import { Question } from '../database/entities/question.entity';
import { Organization } from '../database/entities/organization.entity';

export const MIN_DAILY_PLAN_QUESTIONS = 10;
/** Kunlik plan maqsadi: shu kunda 10 ta TO'G'RI javob (qaysi savol bo'lishidan qat'i nazar). */
export const DAILY_GOAL_CORRECT = 10;

@Injectable()
export class DailyPlanService {
  constructor(
    @InjectRepository(DailyPlan)
    private readonly planRepo: Repository<DailyPlan>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  /** Toshkent (UTC+5) bo'yicha sana — kun chegarasi foydalanuvchi kuni bilan mos. */
  formatDate(d: Date): string {
    return new Date(d.getTime() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  }

  async ensurePlan(organizationId: string, date = new Date()): Promise<DailyPlan> {
    const planDate = this.formatDate(date);
    const existing = await this.planRepo.findOne({
      where: { organizationId, planDate },
    });
    if (existing && existing.questionIds.length >= MIN_DAILY_PLAN_QUESTIONS) {
      return existing;
    }

    const questionIds = await this.pickQuestionIds(organizationId, planDate);
    if (existing) {
      existing.questionIds = questionIds;
      return this.planRepo.save(existing);
    }

    return this.planRepo.save(
      this.planRepo.create({ organizationId, planDate, questionIds }),
    );
  }

  async pickQuestionIds(organizationId: string, planDate: string): Promise<string[]> {
    const all = await this.questionRepo.find({
      where: { isActive: true },
      select: ['id'],
      order: { orderIndex: 'ASC' },
    });
    if (all.length === 0) return [];

    const seed = createHash('sha256')
      .update(`${organizationId}:${planDate}`)
      .digest();
    const shuffled = [...all];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = seed[i % seed.length] % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const count = Math.min(shuffled.length, MIN_DAILY_PLAN_QUESTIONS);
    return shuffled.slice(0, count).map((q) => q.id);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generatePlansForAllOrgs(): Promise<void> {
    const orgs = await this.orgRepo.find({ select: ['id'] });
    const today = new Date();
    for (const org of orgs) {
      await this.ensurePlan(org.id, today);
    }
  }
}
