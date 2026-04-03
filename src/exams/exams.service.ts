import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { ExamAssignmentStatus } from '../common/enums/exam-assignment-status.enum';
import { ExamType } from '../common/enums/exam-type.enum';
import { ExamQuestionSection } from '../common/enums/exam-question-section.enum';
import { ExamQuestionDifficulty } from '../common/enums/exam-question-difficulty.enum';
import { OrganizationsService } from '../organizations/organizations.service';
import { Exam } from '../database/entities/exam.entity';
import { ExamAssignment } from '../database/entities/exam-assignment.entity';
import { ExamAttempt } from '../database/entities/exam-attempt.entity';
import { ExamQuestion } from '../database/entities/exam-question.entity';
import { ExamQuestionOption } from '../database/entities/exam-question-option.entity';
import { ExamQuestionPosition } from '../database/entities/exam-question-position.entity';
import { Position } from '../database/entities/position.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ExamsService {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Position) private readonly positionRepo: Repository<Position>,
    @InjectRepository(Exam) private readonly examRepo: Repository<Exam>,
    @InjectRepository(ExamQuestion) private readonly examQuestionRepo: Repository<ExamQuestion>,
    @InjectRepository(ExamQuestionOption) private readonly examQuestionOptionRepo: Repository<ExamQuestionOption>,
    @InjectRepository(ExamQuestionPosition) private readonly examQuestionPositionRepo: Repository<ExamQuestionPosition>,
    @InjectRepository(ExamAssignment) private readonly assignmentRepo: Repository<ExamAssignment>,
    @InjectRepository(ExamAttempt) private readonly attemptRepo: Repository<ExamAttempt>,
  ) {}

  private async assertDefaultOrgModerator(user: { role: Role; organizationIds: string[] }) {
    if (user.role === Role.SUPERADMIN) return;
    if (user.role !== Role.MODERATOR) throw new ForbiddenException('Sizda ushbu endpoint uchun ruxsat yo`q');
    const isDefault = await this.organizationsService.isDefaultModerator(user.organizationIds ?? []);
    if (!isDefault) throw new ForbiddenException('Sizda ushbu endpoint uchun ruxsat yo`q');
  }

  private async getScopedOrgIds(user: { role: Role; organizationIds: string[] }) {
    if (user.role === Role.SUPERADMIN) return undefined;
    if (user.role !== Role.MODERATOR) return [];
    return this.organizationsService.resolveModeratorScope(user.organizationIds);
  }

  // ─── Positions (default org mods) ──────────────────────────────────────────
  async listPositions() {
    return this.positionRepo.find({ where: { deletedAt: IsNull() }, order: { createdAt: 'DESC' } });
  }

  async createPosition(dto: { title: string }) {
    const exists = await this.positionRepo.findOne({ where: { title: dto.title } });
    if (exists) throw new BadRequestException('Bu nomli lavozim mavjud');
    return this.positionRepo.save(this.positionRepo.create({ title: dto.title }));
  }

  async updatePosition(id: string, dto: { title?: string }) {
    const row = await this.positionRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lavozim topilmadi');
    if (dto.title) row.title = dto.title;
    return this.positionRepo.save(row);
  }

  async deletePosition(id: string) {
    const row = await this.positionRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Lavozim topilmadi');
    await this.positionRepo.softDelete(id);
    return { success: true };
  }

  // ─── Exams (default org mods) ──────────────────────────────────────────────
  async listExams() {
    return this.examRepo.find({ where: { deletedAt: IsNull() }, order: { createdAt: 'DESC' } });
  }

  async createExam(dto: {
    title: string;
    description?: string;
    examType: ExamType;
    isActive?: boolean;
    includesPt?: boolean;
    includesTb?: boolean;
    createdByOrgId?: string | null;
  }) {
    const row = this.examRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      examType: dto.examType,
      isActive: dto.isActive ?? true,
      includesPt: dto.includesPt ?? true,
      includesTb: dto.includesTb ?? true,
      createdByOrgId: dto.createdByOrgId ?? null,
    });
    return this.examRepo.save(row);
  }

  async updateExam(
    id: string,
    dto: Partial<{
      title: string;
      description: string | null;
      examType: ExamType;
      isActive: boolean;
      includesPt: boolean;
      includesTb: boolean;
    }>,
  ) {
    const row = await this.examRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Imtihon topilmadi');
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.examType !== undefined) row.examType = dto.examType;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.includesPt !== undefined) row.includesPt = dto.includesPt;
    if (dto.includesTb !== undefined) row.includesTb = dto.includesTb;
    return this.examRepo.save(row);
  }

  async deleteExam(id: string) {
    const row = await this.examRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Imtihon topilmadi');
    await this.examRepo.softDelete(id);
    return { success: true };
  }

  // ─── Exam questions (default org mods) ─────────────────────────────────────
  async listExamQuestions() {
    return this.examQuestionRepo.find({
      relations: ['options'],
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async createExamQuestion(dto: {
    prompt: string;
    type: any;
    isActive?: boolean;
    tags?: string[] | null;
    section?: ExamQuestionSection;
    difficulty?: ExamQuestionDifficulty;
    options: Array<{ optionText: string; orderIndex?: number; isCorrect?: boolean; matchText?: string | null }>;
    positionIds?: string[];
  }) {
    const question = await this.examQuestionRepo.save(
      this.examQuestionRepo.create({
        prompt: dto.prompt,
        type: dto.type,
        isActive: dto.isActive ?? true,
        tags: dto.tags ?? null,
        section: dto.section ?? ExamQuestionSection.PT,
        difficulty: dto.difficulty ?? ExamQuestionDifficulty.MEDIUM,
        options: (dto.options ?? []).map((o, idx) =>
          this.examQuestionOptionRepo.create({
            optionText: o.optionText,
            orderIndex: o.orderIndex ?? idx,
            isCorrect: o.isCorrect === true,
            matchText: o.matchText ?? null,
          }),
        ),
      }),
    );

    if (dto.positionIds && dto.positionIds.length) {
      const unique = Array.from(new Set(dto.positionIds));
      await this.examQuestionPositionRepo.save(
        unique.map((pid) =>
          this.examQuestionPositionRepo.create({
            questionId: question.id,
            positionId: pid,
          }),
        ),
      );
    }

    return this.examQuestionRepo.findOne({
      where: { id: question.id },
      relations: ['options'],
    });
  }

  async deleteExamQuestion(id: string) {
    const row = await this.examQuestionRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Savol topilmadi');
    await this.examQuestionRepo.softDelete(id);
    return { success: true };
  }

  // ─── Basket (soft-deleted) ────────────────────────────────────────────────
  async listBasket() {
    const [positions, exams, questions] = await Promise.all([
      this.positionRepo.createQueryBuilder('p').withDeleted().where('p.deleted_at IS NOT NULL').orderBy('p.deleted_at', 'DESC').getMany(),
      this.examRepo.createQueryBuilder('e').withDeleted().where('e.deleted_at IS NOT NULL').orderBy('e.deleted_at', 'DESC').getMany(),
      this.examQuestionRepo.createQueryBuilder('q').withDeleted().where('q.deleted_at IS NOT NULL').orderBy('q.deleted_at', 'DESC').getMany(),
    ]);
    return {
      positions,
      exams,
      examQuestions: questions,
    };
  }

  async restoreBasketItem(type: 'positions' | 'exams' | 'exam-questions', id: string) {
    if (type === 'positions') await this.positionRepo.restore(id);
    else if (type === 'exams') await this.examRepo.restore(id);
    else await this.examQuestionRepo.restore(id);
    return { success: true };
  }

  async purgeBasketItem(type: 'positions' | 'exams' | 'exam-questions', id: string) {
    if (type === 'positions') await this.positionRepo.delete(id);
    else if (type === 'exams') await this.examRepo.delete(id);
    else await this.examQuestionRepo.delete(id);
    return { success: true };
  }

  // ─── Upcoming + schedule (org scoped) ──────────────────────────────────────
  async listUpcomingAssignments(requestingUser: { role: Role; organizationIds: string[] }, orgId?: string) {
    const scopedOrgIds = await this.getScopedOrgIds(requestingUser);
    if (scopedOrgIds && scopedOrgIds.length === 0) return [];

    if (orgId) {
      if (scopedOrgIds && !scopedOrgIds.includes(orgId)) {
        throw new ForbiddenException('Sizda ushbu tashkilot uchun ruxsat yo`q');
      }
    }

    const now = new Date();
    const qb = this.assignmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.exam', 'e')
      .leftJoinAndSelect('a.user', 'u')
      .where('a.window_end >= :now', { now })
      .andWhere('a.status IN (:...statuses)', { statuses: [ExamAssignmentStatus.PENDING, ExamAssignmentStatus.SCHEDULED] })
      .orderBy('a.suggested_at', 'ASC');

    if (orgId) {
      qb.andWhere('a.organization_id = :orgId', { orgId });
    } else if (scopedOrgIds) {
      qb.andWhere('a.organization_id IN (:...orgIds)', { orgIds: scopedOrgIds });
    }

    return qb.getMany();
  }

  async scheduleAssignment(
    requestingUser: { role: Role; organizationIds: string[] },
    assignmentId: string,
    scheduledAtIso: string,
  ) {
    const assignment = await this.assignmentRepo.findOne({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException('Assignment topilmadi');

    const scopedOrgIds = await this.getScopedOrgIds(requestingUser);
    if (scopedOrgIds && !scopedOrgIds.includes(assignment.organizationId)) {
      throw new ForbiddenException('Sizda ushbu tashkilot uchun ruxsat yo`q');
    }

    const scheduledAt = new Date(scheduledAtIso);
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('Sana noto`g`ri');

    if (scheduledAt < assignment.windowStart || scheduledAt > assignment.windowEnd) {
      throw new BadRequestException('Imtihon sanasi ruxsat etilgan oynadan tashqarida');
    }

    assignment.scheduledAt = scheduledAt;
    assignment.status = ExamAssignmentStatus.SCHEDULED;
    const saved = await this.assignmentRepo.save(assignment);

    // Notification stub (mobile can fetch /notifications/me)
    await this.notificationsService.create({
      userId: saved.userId,
      title: 'Imtihon belgilandi',
      body: `Imtihon sanasi: ${saved.scheduledAt?.toISOString() ?? ''}`,
      data: {
        assignmentId: saved.id,
        examId: saved.examId,
        scheduledAt: saved.scheduledAt?.toISOString() ?? null,
      },
    });

    return saved;
  }

  // Guards helpers exposed for controllers
  async ensureDefaultOrgModerator(user: { role: Role; organizationIds: string[] }) {
    return this.assertDefaultOrgModerator(user);
  }
}

