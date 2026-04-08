import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
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
import { ExamQuestionCatalog } from '../database/entities/exam-question-catalog.entity';
import { Position } from '../database/entities/position.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
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
    @InjectRepository(ExamQuestionCatalog) private readonly examQuestionCatalogRepo: Repository<ExamQuestionCatalog>,
    @InjectRepository(UserOrganization) private readonly userOrgRepo: Repository<UserOrganization>,
  ) {}

  private async ensureDefaultCatalogs() {
    const n = await this.examQuestionCatalogRepo.count();
    if (n > 0) return;
    await this.examQuestionCatalogRepo.save([
      this.examQuestionCatalogRepo.create({
        title: 'PT',
        section: ExamQuestionSection.PT,
        sortOrder: 0,
      }),
      this.examQuestionCatalogRepo.create({
        title: 'TB',
        section: ExamQuestionSection.TB,
        sortOrder: 1,
      }),
    ]);
  }

  private async createAssignmentForNewExam(
    exam: Exam,
    userId: string,
    organizationId: string,
    requestingUser: { role: Role; organizationIds: string[] },
  ) {
    if (requestingUser.role === Role.MODERATOR) {
      const scoped = await this.getScopedOrgIds(requestingUser);
      if (scoped && !scoped.includes(organizationId)) {
        throw new ForbiddenException('Sizda ushbu tashkilot uchun ruxsat yo`q');
      }
    }
    const uo = await this.userOrgRepo.findOne({
      where: {
        user: { id: userId },
        organization: { id: organizationId },
      },
    });
    if (!uo) throw new BadRequestException('Xodim ushbu tashkilotda ro`yxatdan o`tmagan');

    const now = new Date();
    let suggestedAt: Date;
    let windowStart: Date;
    let windowEnd: Date;
    if (exam.examType === ExamType.EXTRA) {
      suggestedAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      suggestedAt.setUTCHours(10, 0, 0, 0);
      windowStart = now;
      windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else {
      suggestedAt = new Date(now);
      suggestedAt.setUTCDate(suggestedAt.getUTCDate() + 1);
      suggestedAt.setUTCHours(10, 0, 0, 0);
      windowStart = new Date(suggestedAt);
      windowStart.setUTCDate(windowStart.getUTCDate() - 1);
      windowStart.setUTCHours(0, 0, 0, 0);
      windowEnd = new Date(suggestedAt);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
      windowEnd.setUTCHours(23, 59, 59, 999);
    }
    const qrToken = `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    await this.assignmentRepo.save(
      this.assignmentRepo.create({
        examId: exam.id,
        userId,
        organizationId,
        suggestedAt,
        windowStart,
        windowEnd,
        scheduledAt: null,
        status: ExamAssignmentStatus.PENDING,
        includesPt: exam.includesPt ?? true,
        includesTb: exam.includesTb ?? true,
        qrToken,
        qrExpiresAt: windowEnd,
        extraReason: exam.examType === ExamType.EXTRA ? 'Admin: yangi imtihon' : null,
      }),
    );
  }

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

  async createExam(
    dto: {
      title: string;
      description?: string;
      examType: ExamType;
      isActive?: boolean;
      includesPt?: boolean;
      includesTb?: boolean;
      createdByOrgId?: string | null;
      assigneeUserId?: string;
      assigneeOrganizationId?: string;
    },
    requestingUser: { role: Role; organizationIds: string[] },
  ) {
    const { assigneeUserId, assigneeOrganizationId, ...examDto } = dto;
    if ((assigneeUserId && !assigneeOrganizationId) || (!assigneeUserId && assigneeOrganizationId)) {
      throw new BadRequestException('Xodim va tashkilot ikkalasi ham kerak');
    }
    const row = await this.examRepo.save(
      this.examRepo.create({
        title: examDto.title,
        description: examDto.description ?? null,
        examType: examDto.examType,
        isActive: examDto.isActive ?? true,
        includesPt: examDto.includesPt ?? true,
        includesTb: examDto.includesTb ?? true,
        createdByOrgId: examDto.createdByOrgId ?? null,
      }),
    );
    if (assigneeUserId && assigneeOrganizationId) {
      await this.createAssignmentForNewExam(row, assigneeUserId, assigneeOrganizationId, requestingUser);
    }
    return row;
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

  // ─── Exam question catalogs ────────────────────────────────────────────────
  async listExamQuestionCatalogs() {
    await this.ensureDefaultCatalogs();
    return this.examQuestionCatalogRepo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async createExamQuestionCatalog(dto: { title: string; section: ExamQuestionSection; sortOrder?: number }) {
    await this.ensureDefaultCatalogs();
    return this.examQuestionCatalogRepo.save(
      this.examQuestionCatalogRepo.create({
        title: dto.title,
        section: dto.section,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
  }

  async updateExamQuestionCatalog(
    id: string,
    dto: Partial<{ title: string; section: ExamQuestionSection; sortOrder: number }>,
  ) {
    const row = await this.examQuestionCatalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Katalog topilmadi');
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.section !== undefined) row.section = dto.section;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    return this.examQuestionCatalogRepo.save(row);
  }

  async deleteExamQuestionCatalog(id: string) {
    const row = await this.examQuestionCatalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Katalog topilmadi');
    const cnt = await this.examQuestionRepo.count({
      where: { catalogId: id, deletedAt: IsNull() },
    });
    if (cnt > 0) throw new BadRequestException('Katalogda savollar bor');
    await this.examQuestionCatalogRepo.remove(row);
    return { success: true };
  }

  // ─── Exam questions (default org mods) ─────────────────────────────────────
  async listExamQuestions(catalogId?: string) {
    await this.ensureDefaultCatalogs();
    const where: FindOptionsWhere<ExamQuestion> = { deletedAt: IsNull() };
    if (catalogId) where.catalogId = catalogId;
    return this.examQuestionRepo.find({
      relations: ['options', 'catalog'],
      where,
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
    catalogId?: string;
    options: Array<{ optionText: string; orderIndex?: number; isCorrect?: boolean; matchText?: string | null }>;
    positionIds?: string[];
  }) {
    await this.ensureDefaultCatalogs();
    let section = dto.section ?? ExamQuestionSection.PT;
    let catalogId: string | null = null;
    if (dto.catalogId) {
      const cat = await this.examQuestionCatalogRepo.findOne({ where: { id: dto.catalogId } });
      if (!cat) throw new NotFoundException('Katalog topilmadi');
      catalogId = cat.id;
      section = cat.section;
    }

    const question = await this.examQuestionRepo.save(
      this.examQuestionRepo.create({
        prompt: dto.prompt,
        type: dto.type,
        isActive: dto.isActive ?? true,
        tags: dto.tags ?? null,
        section,
        difficulty: dto.difficulty ?? ExamQuestionDifficulty.MEDIUM,
        catalogId,
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
      relations: ['options', 'catalog'],
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

