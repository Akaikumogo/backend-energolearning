import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Role } from '../common/enums/role.enum';
import { ExamType } from '../common/enums/exam-type.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { Exam } from '../database/entities/exam.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';

@Injectable()
export class ExamSchedulerService {
  private readonly logger = new Logger(ExamSchedulerService.name);

  constructor(
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
    @InjectRepository(ExamAssignment)
    private readonly assignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
  ) {}

  private startOfUtcDay(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  }

  private endOfUtcDay(d: Date): Date {
    const x = new Date(d);
    x.setUTCHours(23, 59, 59, 999);
    return x;
  }

  /**
   * Har kuni 00:00 UTC: har bir faol SCHEDULED imtihon uchun har USER+org juftligi
   * keyingi 5 kun uchun alohida assignment (suggested sana 10:00 UTC, oyna ±1 kun).
   * Har biriga unikal qr_token va qr_expires_at = window_end.
   */
  @Cron('0 0 * * *')
  async dailyGenerateUpcomingAssignments(): Promise<void> {
    const exams = await this.examRepo.find({
      where: { examType: ExamType.SCHEDULED, isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    if (!exams.length) return;

    const uoRows = await this.userOrgRepo
      .createQueryBuilder('uo')
      .innerJoinAndSelect('uo.user', 'u')
      .innerJoinAndSelect('uo.organization', 'o')
      .where('u.role = :role', { role: Role.USER })
      .getMany();

    const now = new Date();
    let created = 0;

    for (const exam of exams) {
      for (const uo of uoRows) {
        const userId = uo.user?.id;
        const orgId = uo.organization?.id;
        if (!userId || !orgId) continue;

        for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
          const suggestedAt = new Date(now);
          suggestedAt.setUTCDate(suggestedAt.getUTCDate() + dayOffset);
          suggestedAt.setUTCHours(10, 0, 0, 0);

          const dayStart = this.startOfUtcDay(suggestedAt);
          const dayEnd = this.endOfUtcDay(suggestedAt);

          const existing = await this.assignmentRepo
            .createQueryBuilder('a')
            .where('a.user_id = :userId', { userId })
            .andWhere('a.organization_id = :orgId', { orgId })
            .andWhere('a.exam_id = :examId', { examId: exam.id })
            .andWhere('a.suggested_at >= :dayStart', { dayStart })
            .andWhere('a.suggested_at <= :dayEnd', { dayEnd })
            .getOne();

          if (existing) continue;

          const windowStart = new Date(suggestedAt);
          windowStart.setUTCDate(windowStart.getUTCDate() - 1);
          windowStart.setUTCHours(0, 0, 0, 0);
          const windowEnd = new Date(suggestedAt);
          windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
          windowEnd.setUTCHours(23, 59, 59, 999);

          const qrToken = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);

          await this.assignmentRepo.save(
            this.assignmentRepo.create({
              examId: exam.id,
              userId,
              organizationId: orgId,
              suggestedAt,
              windowStart,
              windowEnd,
              scheduledAt: null,
              status: ExamAssignmentStatus.PENDING,
              includesPt: exam.includesPt ?? true,
              includesTb: exam.includesTb ?? true,
              qrToken,
              qrExpiresAt: windowEnd,
              extraReason: null,
            }),
          );
          created++;
        }
      }
    }

    if (created > 0) {
      this.logger.log(`dailyGenerateUpcomingAssignments: created ${created} assignments`);
    }
  }
}
