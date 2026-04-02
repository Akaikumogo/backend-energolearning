import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamType } from '../common/enums/exam-type.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { Exam } from '../database/entities/exam.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { User } from '../database/entities/user.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';

@Injectable()
export class ExamSchedulerService {
  constructor(
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
    @InjectRepository(ExamAssignment)
    private readonly assignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
  ) {}

  /**
   * MVP scheduler:
   * - Ensures each USER has at least one upcoming assignment for the first active SCHEDULED exam.
   * - Creates suggestedAt = now+7d; window = ±3 days.
   *
   * Later: compute next dates based on submitted attempts, exam config, etc.
   */
  @Cron('0 */6 * * *') // every 6 hours
  async ensureUpcomingAssignments() {
    const exam = await this.examRepo.findOne({
      where: { examType: ExamType.SCHEDULED, isActive: true },
      order: { createdAt: 'ASC' } as any,
    });
    if (!exam) return;

    const now = new Date();
    const suggestedAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const windowStart = new Date(suggestedAt.getTime() - 3 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(suggestedAt.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Users with org membership
    const uoRows = await this.userOrgRepo
      .createQueryBuilder('uo')
      .innerJoin('uo.user', 'u')
      .select(['uo.id', 'uo.organization', 'u.id'])
      .where('u.role = :role', { role: Role.USER })
      .getMany();

    for (const uo of uoRows) {
      const userId = (uo as any).user?.id as string | undefined;
      const orgId = (uo as any).organization?.id as string | undefined;
      if (!userId || !orgId) continue;

      const existing = await this.assignmentRepo.findOne({
        where: {
          userId,
          organizationId: orgId,
          examId: exam.id,
          status: ExamAssignmentStatus.PENDING as any,
        } as any,
      });
      if (existing) continue;

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
        }),
      );
    }
  }
}

