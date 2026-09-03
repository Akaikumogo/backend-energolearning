import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { EmployeeSafetyRecord } from '../database/entities/employee-safety-record.entity';
import { EmployeeSafetyRecordChange } from '../database/entities/employee-safety-record-change.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { SafetyRecordType } from '../database/entities/safety-record-type.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ModeratorPermissionsService } from '../moderator-permissions/moderator-permissions.service';
import { EnergoIdAuthClient } from '../auth/energo-id-auth.client';
import {
  RejectSafetyChangeDto,
  UpsertSafetyRecordDto,
} from './dto/safety-record.dto';

type Actor = {
  id: string;
  role: Role;
  organizationIds: string[];
};

const FIELD_KEYS = [
  'examDate',
  'examReason',
  'grade',
  'qualificationGroup',
  'nextExamDate',
  'ruleName',
  'commissionDecision',
  'protocolNumber',
  'protocolDate',
  'doctorConclusion',
] as const;

@Injectable()
export class SafetyRecordsService {
  constructor(
    @InjectRepository(SafetyRecordType)
    private readonly typeRepo: Repository<SafetyRecordType>,
    @InjectRepository(EmployeeSafetyRecord)
    private readonly recordRepo: Repository<EmployeeSafetyRecord>,
    @InjectRepository(EmployeeSafetyRecordChange)
    private readonly changeRepo: Repository<EmployeeSafetyRecordChange>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(NesEmployee)
    private readonly nesRepo: Repository<NesEmployee>,
    private readonly organizationsService: OrganizationsService,
    private readonly notificationsService: NotificationsService,
    private readonly moderatorPermissionsService: ModeratorPermissionsService,
    private readonly energoIdAuthClient: EnergoIdAuthClient,
  ) {}

  async listTypes() {
    return this.typeRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async listForEmployee(employeeUserId: string, actor: Actor) {
    await this.assertEmployeeAccess(employeeUserId, actor);
    const types = await this.listTypes();
    let records = await this.recordRepo.find({
      where: { userId: employeeUserId },
      relations: [
        'recordType',
        'createdByUser',
        'updatedByUser',
        'approvedByUser',
        'rejectedByUser',
        'deletedByUser',
      ],
      order: { createdAt: 'DESC' },
    });
    // Arxiv (asosiy filial o‘chirishi) — faqat SUPERADMIN
    if (actor.role !== Role.SUPERADMIN) {
      records = records.filter((r) => !r.archivedAt);
    }
    const pendingChanges = await this.changeRepo.find({
      where: {
        userId: employeeUserId,
        approvalStatus: 'PENDING',
        action: In(['CREATE', 'UPDATE']),
      },
      order: { changedAt: 'DESC' },
    });
    const deletedIds = new Set(
      records.filter((r) => r.deletedAt).map((r) => r.id),
    );
    const activePending = pendingChanges.filter(
      (c) => !deletedIds.has(c.recordId),
    );
    const pendingByType = new Map(
      activePending.map((c) => [c.recordTypeCode, c]),
    );

    return types.map((type) => {
      const typeRecords = records.filter((r) => r.recordTypeId === type.id);
      const record =
        typeRecords.find((r) => r.isLatest && !r.deletedAt) ?? null;
      const pending = pendingByType.get(type.code) ?? null;
      return {
        type: this.mapType(type),
        record: record ? this.mapRecord(record) : null,
        records: typeRecords.map((r) => this.mapRecord(r)),
        pendingChange: pending ? this.mapChange(pending) : null,
      };
    });
  }

  async listHistory(
    employeeUserId: string,
    typeCode: string,
    actor: Actor,
  ) {
    await this.assertEmployeeAccess(employeeUserId, actor);
    const type = await this.requireType(typeCode);
    let records = await this.recordRepo.find({
      where: { userId: employeeUserId, recordTypeId: type.id },
      relations: [
        'recordType',
        'createdByUser',
        'updatedByUser',
        'approvedByUser',
        'rejectedByUser',
        'deletedByUser',
      ],
      order: { createdAt: 'DESC' },
      take: 50,
    });
    if (actor.role !== Role.SUPERADMIN) {
      records = records.filter((r) => !r.archivedAt);
    }
    const changes = await this.changeRepo.find({
      where: { userId: employeeUserId, recordTypeCode: type.code },
      relations: ['changedByUser', 'reviewedByUser'],
      order: { changedAt: 'DESC' },
      take: 100,
    });
    return {
      type: this.mapType(type),
      records: records.map((r) => this.mapRecord(r)),
      changes: changes.map((c) => this.mapChange(c)),
    };
  }

  async createOrUpdate(
    employeeUserId: string,
    typeCode: string,
    dto: UpsertSafetyRecordDto,
    actor: Actor,
  ) {
    if (actor.role === Role.APPROVER) {
      throw new ForbiddenException('Tasdiqlovchi maʼlumot kiritolmaydi');
    }
    const employee = await this.assertEmployeeAccess(employeeUserId, actor);
    const type = await this.requireType(typeCode);
    const orgId = await this.resolveEmployeeOrgId(employee);

    const existingLatest = await this.recordRepo.findOne({
      where: {
        userId: employeeUserId,
        recordTypeId: type.id,
        isLatest: true,
        deletedAt: IsNull(),
      },
    });

    // Agar pending o‘zgarish bo‘lsa — yangi draft o‘rniga shuni yangilaymiz.
    if (existingLatest?.approvalStatus === 'PENDING') {
      const oldData = this.snapshot(existingLatest);
      this.applyDto(existingLatest, dto);
      existingLatest.updatedBy = actor.id;
      existingLatest.approvalStatus = 'PENDING';
      const saved = await this.recordRepo.save(existingLatest);
      const newData = this.snapshot(saved);
      const change = await this.changeRepo.save(
        this.changeRepo.create({
          recordId: saved.id,
          userId: employeeUserId,
          organizationId: orgId,
          recordTypeCode: type.code,
          sectionSlug: type.sectionSlug,
          action: 'UPDATE',
          oldData,
          newData,
          changedBy: actor.id,
          approvalStatus: 'PENDING',
        }),
      );
      await this.notifyApprovers(employee, type, change, actor);
      return {
        record: this.mapRecord(saved),
        change: this.mapChange(change),
      };
    }

    // Approved latest mavjud → yangi qator (append history), eski is_latest=false
    if (existingLatest) {
      existingLatest.isLatest = false;
      await this.recordRepo.save(existingLatest);
    }

    const record = this.recordRepo.create({
      userId: employeeUserId,
      organizationId: orgId,
      recordTypeId: type.id,
      isLatest: true,
      approvalStatus: 'PENDING',
      createdBy: actor.id,
      updatedBy: actor.id,
      approvedBy: null,
      approvedAt: null,
    });
    this.applyDto(record, dto);
    const saved = await this.recordRepo.save(record);
    const change = await this.changeRepo.save(
      this.changeRepo.create({
        recordId: saved.id,
        userId: employeeUserId,
        organizationId: orgId,
        recordTypeCode: type.code,
        sectionSlug: type.sectionSlug,
        action: existingLatest ? 'UPDATE' : 'CREATE',
        oldData: existingLatest ? this.snapshot(existingLatest) : null,
        newData: this.snapshot(saved),
        changedBy: actor.id,
        approvalStatus: 'PENDING',
      }),
    );
    await this.notifyApprovers(employee, type, change, actor);
    return {
      record: this.mapRecord(saved),
      change: this.mapChange(change),
    };
  }

  async listPending(actor: Actor) {
    const allowed = await this.organizationsService.getAllowedOrgIds(
      actor.role,
      actor.organizationIds,
    );
    const qb = this.changeRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'u')
      .leftJoinAndSelect('c.changedByUser', 'cb')
      .leftJoinAndSelect('c.organization', 'org')
      .where('c.approvalStatus = :status', { status: 'PENDING' })
      .andWhere('c.action IN (:...actions)', { actions: ['CREATE', 'UPDATE'] })
      .orderBy('c.changedAt', 'DESC');

    if (allowed !== null) {
      if (allowed.length === 0) {
        return { total: 0, items: [] };
      }
      qb.andWhere('c.organizationId IN (:...orgIds)', { orgIds: allowed });
    }

    const changes = await qb.getMany();
    const typeCodes = [...new Set(changes.map((c) => c.recordTypeCode))];
    const types =
      typeCodes.length > 0
        ? await this.typeRepo.find({
            where: { code: In(typeCodes) },
          })
        : [];
    const typeByCode = new Map(types.map((t) => [t.code, t]));

    const items = changes.map((c) => this.mapPendingItem(c, typeByCode.get(c.recordTypeCode)));
    return { total: items.length, items };
  }

  async countPending(actor: Actor) {
    const allowed = await this.organizationsService.getAllowedOrgIds(
      actor.role,
      actor.organizationIds,
    );
    const qb = this.changeRepo
      .createQueryBuilder('c')
      .where('c.approvalStatus = :status', { status: 'PENDING' })
      .andWhere('c.action IN (:...actions)', { actions: ['CREATE', 'UPDATE'] });

    if (allowed !== null) {
      if (allowed.length === 0) return { total: 0 };
      qb.andWhere('c.organizationId IN (:...orgIds)', { orgIds: allowed });
    }

    const total = await qb.getCount();
    return { total };
  }

  async bulkApprove(changeIds: string[], actor: Actor) {
    const results: Array<{
      changeId: string;
      ok: boolean;
      error?: string;
    }> = [];
    for (const id of changeIds) {
      try {
        await this.approve(id, actor);
        results.push({ changeId: id, ok: true });
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'Tasdiqlash muvaffaqiyatsiz';
        results.push({ changeId: id, ok: false, error: msg });
      }
    }
    return {
      approved: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async bulkReject(
    changeIds: string[],
    dto: RejectSafetyChangeDto,
    actor: Actor,
  ) {
    const results: Array<{
      changeId: string;
      ok: boolean;
      error?: string;
    }> = [];
    for (const id of changeIds) {
      try {
        await this.reject(id, dto, actor);
        results.push({ changeId: id, ok: true });
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'Rad etish muvaffaqiyatsiz';
        results.push({ changeId: id, ok: false, error: msg });
      }
    }
    return {
      rejected: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  private mapPendingItem(
    change: EmployeeSafetyRecordChange,
    type: SafetyRecordType | undefined,
  ) {
    const employee = change.user;
    return {
      change: this.mapChange(change),
      employee: employee
        ? {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email: employee.email,
          }
        : {
            id: change.userId,
            firstName: null as string | null,
            lastName: null as string | null,
            email: null as string | null,
          },
      organization: change.organization
        ? { id: change.organization.id, name: change.organization.name }
        : { id: change.organizationId, name: null },
      type: type ? this.mapType(type) : null,
    };
  }

  async approve(changeId: string, actor: Actor) {
    if (actor.role !== Role.APPROVER && actor.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('Tasdiqlash huquqi yoʻq');
    }
    const change = await this.requirePendingChange(changeId, actor);
    const record = await this.recordRepo.findOne({
      where: { id: change.recordId },
    });
    if (!record) throw new NotFoundException('Yozuv topilmadi');

    record.approvalStatus = 'APPROVED';
    record.approvedBy = actor.id;
    record.approvedAt = new Date();
    record.rejectedBy = null;
    record.rejectedAt = null;
    if (change.newData) {
      this.applySnapshot(record, change.newData);
    }
    await this.recordRepo.save(record);

    change.approvalStatus = 'APPROVED';
    change.reviewedBy = actor.id;
    change.reviewedAt = new Date();
    await this.changeRepo.save(change);

    await this.changeRepo.save(
      this.changeRepo.create({
        recordId: record.id,
        userId: change.userId,
        organizationId: change.organizationId,
        recordTypeCode: change.recordTypeCode,
        sectionSlug: change.sectionSlug,
        action: 'APPROVE',
        oldData: change.oldData,
        newData: change.newData,
        changedBy: actor.id,
        approvalStatus: 'APPROVED',
        reviewedBy: actor.id,
        reviewedAt: new Date(),
      }),
    );

    if (change.notificationId) {
      await this.notificationsService.resolve(change.notificationId);
    }
    await this.notificationsService.resolveByChangeId(change.id);

    void this.syncSafetyBadgeToEnergo(change.userId);

    return {
      record: this.mapRecord(record),
      change: this.mapChange(change),
    };
  }

  async reject(changeId: string, dto: RejectSafetyChangeDto, actor: Actor) {
    if (actor.role !== Role.APPROVER && actor.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('Rad etish huquqi yoʻq');
    }
    const change = await this.requirePendingChange(changeId, actor);
    const record = await this.recordRepo.findOne({
      where: { id: change.recordId },
    });
    if (!record) throw new NotFoundException('Yozuv topilmadi');

    // Reject → old_data ga qaytarish (tavsiya A)
    if (change.oldData) {
      this.applySnapshot(record, change.oldData);
      record.approvalStatus = 'APPROVED';
      record.isLatest = true;
    } else {
      // CREATE rad etilgan — yozuvni arxivlash
      record.isLatest = false;
      record.approvalStatus = 'REJECTED';
      record.rejectedBy = actor.id;
      record.rejectedAt = new Date();
    }
    record.updatedBy = actor.id;
    await this.recordRepo.save(record);

    change.approvalStatus = 'REJECTED';
    change.reviewedBy = actor.id;
    change.reviewedAt = new Date();
    change.reviewNote = dto.reviewNote?.trim() || null;
    await this.changeRepo.save(change);

    await this.changeRepo.save(
      this.changeRepo.create({
        recordId: record.id,
        userId: change.userId,
        organizationId: change.organizationId,
        recordTypeCode: change.recordTypeCode,
        sectionSlug: change.sectionSlug,
        action: 'REJECT',
        oldData: change.oldData,
        newData: change.newData,
        changedBy: actor.id,
        approvalStatus: 'REJECTED',
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        reviewNote: change.reviewNote,
      }),
    );

    if (change.notificationId) {
      await this.notificationsService.resolve(change.notificationId);
    }
    await this.notificationsService.resolveByChangeId(change.id);

    return {
      record: this.mapRecord(record),
      change: this.mapChange(change),
    };
  }

  /**
   * Soft-delete. Oddiy filial moderatori → "o‘chirilgan" izi ko‘rinadi.
   * Asosiy filial moderatori (delete ruxsati) yoki SUPERADMIN → arxiv (faqat SUPERADMIN).
   */
  async softDelete(recordId: string, actor: Actor) {
    if (actor.role !== Role.SUPERADMIN && actor.role !== Role.MODERATOR) {
      throw new ForbiddenException('Oʻchirish huquqi yoʻq');
    }
    const record = await this.recordRepo.findOne({
      where: { id: recordId },
      relations: [
        'recordType',
        'createdByUser',
        'updatedByUser',
        'approvedByUser',
        'rejectedByUser',
        'deletedByUser',
      ],
    });
    if (!record || record.deletedAt) {
      throw new NotFoundException('Yozuv topilmadi');
    }
    await this.assertOrgAccess(record.organizationId, actor);

    let archive = actor.role === Role.SUPERADMIN;
    if (actor.role === Role.MODERATOR) {
      const isDefault = await this.organizationsService.isDefaultModerator(
        actor.organizationIds ?? [],
      );
      if (isDefault) {
        const perms = await this.moderatorPermissionsService.getOrCreate(
          actor.id,
        );
        if (perms.permissions.safetyRecords?.delete) {
          archive = true;
        }
      }
    }

    const now = new Date();
    const oldData = this.snapshot(record);
    record.deletedAt = now;
    record.deletedBy = actor.id;
    record.isLatest = false;
    record.updatedBy = actor.id;
    if (archive) {
      record.archivedAt = now;
    }
    const saved = await this.recordRepo.save(record);

    const pending = await this.changeRepo.find({
      where: {
        recordId: record.id,
        approvalStatus: 'PENDING',
        action: In(['CREATE', 'UPDATE']),
      },
    });
    for (const p of pending) {
      p.approvalStatus = 'REJECTED';
      p.reviewedBy = actor.id;
      p.reviewedAt = now;
      p.reviewNote = 'Yozuv o‘chirildi';
      await this.changeRepo.save(p);
      if (p.notificationId) {
        await this.notificationsService.resolve(p.notificationId);
      }
      await this.notificationsService.resolveByChangeId(p.id);
    }

    const typeCode = record.recordType?.code ?? '';
    const sectionSlug = record.recordType?.sectionSlug ?? '';
    await this.changeRepo.save(
      this.changeRepo.create({
        recordId: record.id,
        userId: record.userId,
        organizationId: record.organizationId,
        recordTypeCode: typeCode,
        sectionSlug,
        action: 'DELETE',
        oldData,
        newData: {
          deletedAt: now.toISOString(),
          archived: archive,
        },
        changedBy: actor.id,
        approvalStatus: 'APPROVED',
        reviewedBy: actor.id,
        reviewedAt: now,
        reviewNote: archive
          ? 'Arxivga o‘tkazildi (faqat SUPERADMIN)'
          : 'Soft-delete',
      }),
    );

    // relations for map
    saved.deletedByUser =
      (await this.userRepo.findOne({ where: { id: actor.id } })) ?? null;

    return {
      record: this.mapRecord(saved),
      archived: archive,
    };
  }

  private async requirePendingChange(changeId: string, actor: Actor) {
    const change = await this.changeRepo.findOne({ where: { id: changeId } });
    if (!change || change.approvalStatus !== 'PENDING') {
      throw new NotFoundException('Tasdiqlash kutilayotgan o‘zgarish topilmadi');
    }
    await this.assertOrgAccess(change.organizationId, actor);
    return change;
  }

  private async assertEmployeeAccess(employeeUserId: string, actor: Actor) {
    const employee = await this.userRepo.findOne({
      where: { id: employeeUserId },
      relations: ['organizations', 'organizations.organization'],
    });
    if (!employee || !employee.energoId) {
      throw new NotFoundException('Xodim topilmadi');
    }
    const orgId = await this.resolveEmployeeOrgId(employee);
    await this.assertOrgAccess(orgId, actor);
    return employee;
  }

  private async assertOrgAccess(orgId: string, actor: Actor) {
    const allowed = await this.organizationsService.getAllowedOrgIds(
      actor.role,
      actor.organizationIds,
    );
    if (allowed === null) return;
    if (!allowed.includes(orgId)) {
      throw new ForbiddenException('Filialga ruxsat yoʻq');
    }
  }

  private async resolveEmployeeOrgId(employee: User): Promise<string> {
    const nes = await this.nesRepo.find({
      where: { userId: employee.id },
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    if (nes[0]?.organizationId) return nes[0].organizationId;
    const fromJoin = employee.organizations?.[0]?.organization?.id;
    if (fromJoin) return fromJoin;
    throw new NotFoundException('Xodim filiali topilmadi');
  }

  private async requireType(code: string) {
    const type = await this.typeRepo.findOne({
      where: { code: code.trim().toUpperCase() },
    });
    if (!type) throw new NotFoundException('Sertifikat turi topilmadi');
    return type;
  }

  private async notifyApprovers(
    employee: User,
    type: SafetyRecordType,
    change: EmployeeSafetyRecordChange,
    actor: Actor,
  ) {
    const approvers = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin('u.organizations', 'uo')
      .innerJoin('uo.organization', 'org')
      .where('u.role = :role', { role: Role.APPROVER })
      .andWhere('org.id = :orgId', {
        orgId: change.organizationId,
      })
      .getMany();

    const superadmins = await this.userRepo.find({
      where: { role: Role.SUPERADMIN },
    });

    const recipients = new Map<string, User>();
    for (const a of approvers) recipients.set(a.id, a);
    for (const s of superadmins) recipients.set(s.id, s);
    recipients.delete(actor.id);

    const fullName =
      `${employee.lastName ?? ''} ${employee.firstName ?? ''}`.trim() ||
      employee.email;
    const title = 'Xodim maʼlumotini tasdiqlang';
    const body = `${fullName} — ${type.titleUz} maʼlumoti o‘zgartirildi`;
    const data = {
      type: 'SAFETY_RECORD_APPROVAL',
      changeId: change.id,
      employeeUserId: employee.id,
      recordTypeCode: type.code,
      section: type.sectionSlug,
      organizationId: change.organizationId,
      reviewPath: `/dashboard/approvals?changeId=${change.id}`,
    };

    let firstNotificationId: string | null = null;
    for (const recipient of recipients.values()) {
      const n = await this.notificationsService.create({
        userId: recipient.id,
        title,
        body,
        data,
      });
      if (!firstNotificationId) firstNotificationId = n.id;
    }
    if (firstNotificationId) {
      change.notificationId = firstNotificationId;
      await this.changeRepo.save(change);
    }
  }

  private applyDto(record: EmployeeSafetyRecord, dto: UpsertSafetyRecordDto) {
    if (dto.examDate !== undefined) record.examDate = dto.examDate;
    if (dto.examReason !== undefined) record.examReason = dto.examReason;
    if (dto.grade !== undefined) record.grade = dto.grade;
    if (dto.qualificationGroup !== undefined) {
      record.qualificationGroup = dto.qualificationGroup;
    }
    if (dto.nextExamDate !== undefined) record.nextExamDate = dto.nextExamDate;
    if (dto.ruleName !== undefined) record.ruleName = dto.ruleName;
    if (dto.commissionDecision !== undefined) {
      record.commissionDecision = dto.commissionDecision;
    }
    if (dto.protocolNumber !== undefined) {
      record.protocolNumber = dto.protocolNumber;
    }
    if (dto.protocolDate !== undefined) record.protocolDate = dto.protocolDate;
    if (dto.doctorConclusion !== undefined) {
      record.doctorConclusion = dto.doctorConclusion;
    }
  }

  private snapshot(record: EmployeeSafetyRecord): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of FIELD_KEYS) {
      out[key] = record[key] ?? null;
    }
    out.approvalStatus = record.approvalStatus;
    return out;
  }

  private applySnapshot(
    record: EmployeeSafetyRecord,
    data: Record<string, unknown>,
  ) {
    for (const key of FIELD_KEYS) {
      if (key in data) {
        (record as unknown as Record<string, unknown>)[key] = data[key] ?? null;
      }
    }
  }

  private mapType(type: SafetyRecordType) {
    return {
      id: type.id,
      code: type.code,
      titleUz: type.titleUz,
      titleRu: type.titleRu,
      titleEn: type.titleEn,
      sectionSlug: type.sectionSlug,
      sortOrder: type.sortOrder,
    };
  }

  private mapUserBrief(u: User | null | undefined) {
    if (!u) return null;
    return {
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
    };
  }

  private mapRecord(record: EmployeeSafetyRecord) {
    return {
      id: record.id,
      userId: record.userId,
      organizationId: record.organizationId,
      recordTypeId: record.recordTypeId,
      recordTypeCode: record.recordType?.code ?? null,
      sectionSlug: record.recordType?.sectionSlug ?? null,
      examDate: record.examDate,
      examReason: record.examReason,
      grade: record.grade,
      qualificationGroup: record.qualificationGroup,
      nextExamDate: record.nextExamDate,
      ruleName: record.ruleName,
      commissionDecision: record.commissionDecision,
      protocolNumber: record.protocolNumber,
      protocolDate: record.protocolDate,
      doctorConclusion: record.doctorConclusion,
      isLatest: record.isLatest,
      approvalStatus: record.approvalStatus,
      createdBy: this.mapUserBrief(record.createdByUser),
      updatedBy: this.mapUserBrief(record.updatedByUser),
      approvedBy: this.mapUserBrief(record.approvedByUser),
      approvedAt: record.approvedAt,
      rejectedBy: this.mapUserBrief(record.rejectedByUser),
      rejectedAt: record.rejectedAt,
      deletedBy: this.mapUserBrief(record.deletedByUser),
      deletedAt: record.deletedAt,
      archivedAt: record.archivedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapChange(change: EmployeeSafetyRecordChange) {
    return {
      id: change.id,
      recordId: change.recordId,
      userId: change.userId,
      organizationId: change.organizationId,
      recordTypeCode: change.recordTypeCode,
      sectionSlug: change.sectionSlug,
      action: change.action,
      oldData: change.oldData,
      newData: change.newData,
      changedBy: this.mapUserBrief(change.changedByUser) ?? {
        id: change.changedBy,
      },
      changedAt: change.changedAt,
      approvalStatus: change.approvalStatus,
      reviewedBy: this.mapUserBrief(change.reviewedByUser),
      reviewedAt: change.reviewedAt,
      reviewNote: change.reviewNote,
      notificationId: change.notificationId,
    };
  }

  /** Ochiq guvohnoma / beydj uchun — oxirgi tasdiqlangan yozuvlar. */
  async publicBadgeForUser(userId: string) {
    const types = await this.listTypes();
    const records = await this.recordRepo.find({
      where: {
        userId,
        isLatest: true,
        approvalStatus: 'APPROVED',
        archivedAt: IsNull(),
      },
      relations: ['recordType'],
      order: { updatedAt: 'DESC' },
    });

    const SHORT: Record<string, string> = {
      TECHNICAL_OPERATION: 'ТЭҚҚ',
      OCCUPATIONAL_SAFETY: 'ХТҚ',
      FIRE_SAFETY: 'ЁХҚ',
      INDUSTRIAL_SAFETY: 'ЖБЁКҚ',
      MEDICAL_EXAM: 'Тиббий',
    };

    const byType = new Map<string, EmployeeSafetyRecord>();
    for (const row of records) {
      const code = row.recordType?.code;
      if (!code || byType.has(code)) continue;
      byType.set(code, row);
    }

    const exams = types.map((type) => {
      const row = byType.get(type.code);
      return {
        code: type.code,
        shortLabel: SHORT[type.code] ?? type.code,
        titleUz: type.titleUz,
        examDate: row?.examDate ?? null,
        nextExamDate: row?.nextExamDate ?? null,
        grade: row?.grade ?? null,
        qualificationGroup: row?.qualificationGroup ?? null,
        doctorConclusion: row?.doctorConclusion ?? null,
      };
    });

    return {
      exams,
      specialWorks: 'Йўқ',
    };
  }

  /** Tasdiqlangan bilim sinovi — Energo ID public sahifa uchun. */
  private async syncSafetyBadgeToEnergo(employeeUserId: string) {
    try {
      const user = await this.userRepo.findOne({
        where: { id: employeeUserId },
        select: ['id', 'energoId'],
      });
      const energoId = user?.energoId?.trim();
      if (!energoId) return;
      const safetyBadge = await this.publicBadgeForUser(employeeUserId);
      await this.energoIdAuthClient.pushSafetyBadge(energoId, safetyBadge);
    } catch {
      /* Energo ID sync ixtiyoriy — xatolik asosiy oqimni buzmasin */
    }
  }
}
