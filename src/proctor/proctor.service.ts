import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { DataSource, In, IsNull, LessThan, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { EmployeeSafetyRecord } from '../database/entities/employee-safety-record.entity';
import { Organization } from '../database/entities/organization.entity';
import {
  ProctorAnswer,
  ProctorAttempt,
  ProctorAttemptQuestion,
  ProctorEvent,
  ProctorPolicy,
  ProctorQuestion,
  ProctorQuestionOption,
  ProctorRecording,
  ProctorResult,
  ProctorRoom,
  ProctorRoomModerator,
  ProctorStandard,
  ProctorStandardQuestion,
  ProctorUploadJob,
  ProctorViolation,
} from '../database/entities/proctor.entities';
import { SafetyRecordType } from '../database/entities/safety-record-type.entity';
import { User } from '../database/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateRoomDto,
  EventsDto,
  HeartbeatDto,
  InterruptDto,
  RecordingChunkDto,
  SaveAnswerDto,
  SightingsDto,
  UpdatePolicyDto,
  UpsertQuestionDto,
  UpsertStandardDto,
} from './proctor.dto';
import {
  StandardConfig,
  assertAssignee,
  assertTransition,
  beginFinalize,
  buildRecordingRelativePath,
  canRestart,
  detectRemoteTools,
  gradeAttempt,
  nextExamDate,
  orderOptions,
  selectQuestions,
  interruptTimer,
  resumeTimer,
  tickTimer,
  toEmployeeResult,
  validateQuestion,
  validateStandard,
  type RoomStatus,
} from './proctor.engine';

export type Actor = {
  id: string;
  role: Role;
  organizationIds?: string[];
};

@Injectable()
export class ProctorService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProctorQuestion) private readonly questions: Repository<ProctorQuestion>,
    @InjectRepository(ProctorQuestionOption) private readonly options: Repository<ProctorQuestionOption>,
    @InjectRepository(ProctorStandard) private readonly standards: Repository<ProctorStandard>,
    @InjectRepository(ProctorStandardQuestion) private readonly links: Repository<ProctorStandardQuestion>,
    @InjectRepository(ProctorPolicy) private readonly policies: Repository<ProctorPolicy>,
    @InjectRepository(ProctorRoom) private readonly rooms: Repository<ProctorRoom>,
    @InjectRepository(ProctorRoomModerator) private readonly roomMods: Repository<ProctorRoomModerator>,
    @InjectRepository(ProctorAttempt) private readonly attempts: Repository<ProctorAttempt>,
    @InjectRepository(ProctorAttemptQuestion) private readonly attemptQuestions: Repository<ProctorAttemptQuestion>,
    @InjectRepository(ProctorAnswer) private readonly answers: Repository<ProctorAnswer>,
    @InjectRepository(ProctorEvent) private readonly events: Repository<ProctorEvent>,
    @InjectRepository(ProctorResult) private readonly results: Repository<ProctorResult>,
    @InjectRepository(ProctorRecording) private readonly recordings: Repository<ProctorRecording>,
    @InjectRepository(ProctorUploadJob) private readonly uploads: Repository<ProctorUploadJob>,
    @InjectRepository(ProctorViolation) private readonly violations: Repository<ProctorViolation>,
    @InjectRepository(EmployeeSafetyRecord) private readonly safety: Repository<EmployeeSafetyRecord>,
    @InjectRepository(SafetyRecordType) private readonly safetyTypes: Repository<SafetyRecordType>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly notifications: NotificationsService,
  ) {}

  private assertStaff(actor: Actor) {
    if (actor.role !== Role.SUPERADMIN && actor.role !== Role.MODERATOR) {
      throw new ForbiddenException('Ruxsat yo‘q');
    }
  }

  private assertOrg(actor: Actor, organizationId: string) {
    this.assertStaff(actor);
    if (actor.role === Role.SUPERADMIN) return;
    if ((actor.organizationIds ?? []).includes(organizationId)) return;
    throw new ForbiddenException('Filial doirangizdan tashqari');
  }

  private assertCentral(actor: Actor) {
    if (actor.role !== Role.SUPERADMIN) {
      throw new ForbiddenException('Qayta boshlash faqat markaziy apparat uchun');
    }
  }

  private snapshot(standard: ProctorStandard): StandardConfig & {
    standardId: string;
    name: string;
    code: string;
    subject: string;
    retryMaxAttempts: number;
    recordingRequired: boolean;
  } {
    return {
      standardId: standard.id,
      name: standard.name,
      code: standard.code,
      subject: standard.subject,
      durationMs: standard.durationMs,
      passPercent: standard.passPercent,
      randomizeQuestions: standard.randomizeQuestions,
      randomizeOptions: standard.randomizeOptions,
      maxRecordingMb: standard.maxRecordingMb,
      totalQuestions: standard.totalQuestions,
      categoryPlan: standard.categoryPlan ?? [],
      nextExamRule: standard.nextExamRule,
      gradeThresholds: standard.gradeThresholds ?? [],
      retryMaxAttempts: standard.retryMaxAttempts,
      recordingRequired: standard.recordingRequired,
    };
  }

  async listQuestions(page = 1, limit = 20, search?: string) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const qb = this.questions.createQueryBuilder('q').orderBy('q.createdAt', 'DESC');
    if (search?.trim()) qb.where('q.prompt ILIKE :q', { q: `%${search.trim()}%` });
    const [rows, total] = await qb.skip(skip).take(take).getManyAndCount();
    const ids = rows.map((row) => row.id);
    const opts = ids.length
      ? await this.options.find({ where: { questionId: In(ids) }, order: { sortOrder: 'ASC' } })
      : [];
    return {
      total,
      data: rows.map((row) => ({
        ...row,
        options: opts.filter((opt) => opt.questionId === row.id),
      })),
    };
  }

  async saveQuestion(dto: UpsertQuestionDto, actor: Actor, id?: string) {
    this.assertStaff(actor);
    const errors = validateQuestion(dto);
    if (errors.length) throw new BadRequestException(errors.join('. '));
    const row = id
      ? await this.questions.findOne({ where: { id } })
      : this.questions.create();
    if (!row) throw new NotFoundException('Savol topilmadi');
    row.prompt = dto.prompt.trim();
    row.imageUrl = dto.imageUrl?.trim() || null;
    row.type = dto.type;
    row.subject = dto.subject.trim();
    row.category = dto.category.trim();
    row.difficulty = dto.difficulty ?? row.difficulty ?? 'MEDIUM';
    row.isActive = dto.isActive ?? true;
    row.explanation = dto.explanation?.trim() || null;
    row.updatedBy = actor.id;
    if (!id) row.createdBy = actor.id;
    const saved = await this.questions.save(row);
    await this.options.delete({ questionId: saved.id });
    await this.options.save(
      dto.options.map((opt, index) =>
        this.options.create({
          questionId: saved.id,
          text: opt.text.trim(),
          isCorrect: opt.isCorrect,
          sortOrder: index,
        }),
      ),
    );
    return this.listQuestions(1, 1);
  }

  async deleteQuestion(id: string, actor: Actor) {
    this.assertStaff(actor);
    const used = await this.attemptQuestions.count({ where: { questionId: id } });
    if (used) throw new BadRequestException('Savol imtihon urinishida ishlatilgan');
    await this.questions.delete(id);
    return { ok: true };
  }

  async listStandards() {
    const rows = await this.standards.find({ order: { name: 'ASC' } });
    const links = rows.length
      ? await this.links.find({ where: { standardId: In(rows.map((row) => row.id)) } })
      : [];
    return rows.map((row) => ({
      ...row,
      questionIds: links.filter((link) => link.standardId === row.id).map((link) => link.questionId),
    }));
  }

  async saveStandard(dto: UpsertStandardDto, actor: Actor, id?: string) {
    this.assertStaff(actor);
    const pool = await this.poolFor(dto.questionIds ?? []);
    const config: StandardConfig = {
      durationMs: dto.durationMs,
      passPercent: dto.passPercent,
      randomizeQuestions: dto.randomizeQuestions ?? true,
      randomizeOptions: dto.randomizeOptions ?? true,
      maxRecordingMb: dto.maxRecordingMb,
      totalQuestions: dto.totalQuestions,
      categoryPlan: dto.categoryPlan ?? [],
      nextExamRule: dto.nextExamRule
        ? dto.nextExamRule.kind === 'months'
          ? { kind: 'months', months: dto.nextExamRule.months ?? 0 }
          : { kind: 'review' }
        : null,
      gradeThresholds: dto.gradeThresholds ?? [],
    };
    const errors = validateStandard(config, pool);
    if (dto.questionIds?.length && errors.length) throw new BadRequestException(errors.join('. '));
    const row = id ? await this.standards.findOne({ where: { id } }) : this.standards.create();
    if (!row) throw new NotFoundException('Standart topilmadi');
    Object.assign(row, {
      name: dto.name.trim(),
      code: dto.code.trim(),
      description: dto.description?.trim() ?? '',
      subject: dto.subject?.trim() ?? '',
      durationMs: dto.durationMs,
      passPercent: dto.passPercent,
      randomizeQuestions: dto.randomizeQuestions ?? true,
      randomizeOptions: dto.randomizeOptions ?? true,
      maxRecordingMb: dto.maxRecordingMb,
      totalQuestions: dto.totalQuestions,
      categoryPlan: dto.categoryPlan ?? [],
      nextExamRule: config.nextExamRule,
      gradeThresholds: dto.gradeThresholds ?? [],
      retryMaxAttempts: dto.retryMaxAttempts ?? 1,
      recordingRequired: dto.recordingRequired ?? true,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.standards.save(row);
    if (dto.questionIds) {
      await this.links.delete({ standardId: saved.id });
      await this.links.save(
        [...new Set(dto.questionIds)].map((questionId) =>
          this.links.create({ standardId: saved.id, questionId }),
        ),
      );
    }
    return saved;
  }

  private async poolFor(questionIds: string[]) {
    if (!questionIds.length) return [];
    const rows = await this.questions.find({ where: { id: In(questionIds) } });
    return rows.map((row) => ({ id: row.id, category: row.category, active: row.isActive }));
  }

  async listPolicies() {
    return this.policies.find({ order: { recordTypeCode: 'ASC' } });
  }

  async updatePolicy(code: string, dto: UpdatePolicyDto, actor: Actor) {
    if (actor.role !== Role.SUPERADMIN) throw new ForbiddenException('Faqat markaziy apparat');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.cutoffDate)) {
      throw new BadRequestException('Sana YYYY-MM-DD bo‘lishi kerak');
    }
    const row = await this.policies.findOne({ where: { recordTypeCode: code } });
    if (!row) throw new NotFoundException('Siyosat topilmadi');
    row.requiresExamRoom = dto.requiresExamRoom;
    row.cutoffDate = dto.cutoffDate;
    row.updatedBy = actor.id;
    return this.policies.save(row);
  }

  async dashboard(actor: Actor, orgId?: string, from?: string, to?: string) {
    this.assertStaff(actor);
    const qb = this.rooms.createQueryBuilder('r');
    if (actor.role !== Role.SUPERADMIN) {
      qb.andWhere('r.organizationId IN (:...orgs)', {
        orgs: actor.organizationIds?.length ? actor.organizationIds : ['00000000-0000-0000-0000-000000000000'],
      });
    } else if (orgId) qb.andWhere('r.organizationId = :orgId', { orgId });
    if (from) qb.andWhere('r.scheduledAt >= :from', { from });
    if (to) qb.andWhere('r.scheduledAt <= :to', { to });
    const rows = await qb.select('r.status', 'status').addSelect('COUNT(*)', 'count').groupBy('r.status').getRawMany<{ status: string; count: string }>();
    const byStatus = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    const resultQb = this.results.createQueryBuilder('res').innerJoin(ProctorRoom, 'room', 'room.id = res.room_id');
    if (actor.role !== Role.SUPERADMIN) {
      resultQb.andWhere('room.organizationId IN (:...orgs)', {
        orgs: actor.organizationIds?.length ? actor.organizationIds : ['00000000-0000-0000-0000-000000000000'],
      });
    }
    const grades = await resultQb.select('res.passed', 'passed').addSelect('COUNT(*)', 'count').groupBy('res.passed').getRawMany<{ passed: boolean; count: string }>();
    return {
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      byStatus,
      upcoming: (byStatus.SCHEDULED ?? 0) + (byStatus.READY ?? 0),
      active: byStatus.IN_PROGRESS ?? 0,
      interrupted: (byStatus.INTERRUPTED ?? 0) + (byStatus.PENDING_SYNC ?? 0),
      completed: byStatus.COMPLETED ?? 0,
      passed: Number(grades.find((row) => row.passed === true || String(row.passed) === 'true')?.count ?? 0),
      failed: Number(grades.find((row) => row.passed === false || String(row.passed) === 'false')?.count ?? 0),
    };
  }

  async createRoom(dto: CreateRoomDto, actor: Actor) {
    this.assertStaff(actor);
    const record = await this.safety.findOne({ where: { id: dto.safetyRecordId } });
    if (!record || record.userId !== dto.userId) throw new BadRequestException('Xavfsizlik yozuvi topilmadi');
    this.assertOrg(actor, record.organizationId);
    const type = await this.safetyTypes.findOne({ where: { id: record.recordTypeId } });
    const standard = await this.standards.findOne({ where: { id: dto.standardId, isActive: true } });
    if (!standard || !type) throw new BadRequestException('Standart yoki bo‘lim topilmadi');
    const links = await this.links.find({ where: { standardId: standard.id } });
    const pool = await this.poolFor(links.map((link) => link.questionId));
    const snap = this.snapshot(standard);
    const errors = validateStandard(snap, pool);
    if (errors.length) throw new BadRequestException(errors.join('. '));
    const scheduledAt = new Date(dto.scheduledAt);
    const expiresAt = new Date(dto.expiresAt);
    if (!(expiresAt > scheduledAt)) throw new BadRequestException('Tugash vaqti boshlanishdan keyin');
    const room = await this.rooms.save(
      this.rooms.create({
        userId: dto.userId,
        organizationId: record.organizationId,
        safetyRecordId: record.id,
        recordTypeCode: type.code,
        standardId: standard.id,
        snapshot: snap,
        scheduledAt,
        expiresAt,
        status: 'DRAFT',
        attemptNumber: 0,
        accessToken: randomBytes(24).toString('hex'),
        recordingRequired: standard.recordingRequired,
        maxRecordingMb: standard.maxRecordingMb,
        createdBy: actor.id,
        notificationStatus: 'PENDING',
      }),
    );
    if (dto.moderatorIds?.length) {
      await this.roomMods.save(
        [...new Set(dto.moderatorIds)].map((userId) => this.roomMods.create({ roomId: room.id, userId })),
      );
    }
    return this.scheduleRoom(room.id, actor);
  }

  async scheduleRoom(id: string, actor: Actor) {
    const room = await this.requireRoom(id);
    this.assertOrg(actor, room.organizationId);
    if (room.status === 'DRAFT') {
      assertTransition(room.status as RoomStatus, 'SCHEDULED');
      room.status = 'SCHEDULED';
    }
    await this.notifyRoom(room);
    return this.rooms.save(room);
  }

  private async notifyRoom(room: ProctorRoom) {
    if (room.notificationStatus === 'SENT') return;
    const snap = room.snapshot as { name?: string };
    try {
      const note = await this.notifications.create({
        userId: room.userId,
        title: 'Attestatsiya imtihoni',
        body: `${room.scheduledAt.toISOString()} — ${snap.name ?? 'Imtihon'}`,
        data: {
          type: 'proctor_room',
          roomId: room.id,
          token: room.accessToken,
          scheduledAt: room.scheduledAt.toISOString(),
          standardName: snap.name ?? '',
        },
      });
      room.notificationId = note.id;
      room.notificationStatus = 'SENT';
    } catch {
      room.notificationStatus = 'FAILED';
    }
  }

  async retryNotify(id: string, actor: Actor) {
    const room = await this.requireRoom(id);
    this.assertOrg(actor, room.organizationId);
    if (room.notificationStatus === 'SENT') return { alreadySent: true, roomId: room.id };
    room.notificationStatus = 'PENDING';
    await this.notifyRoom(room);
    await this.rooms.save(room);
    return { alreadySent: false, status: room.notificationStatus };
  }

  async listRooms(actor: Actor, page = 1, limit = 20, status?: string) {
    this.assertStaff(actor);
    const take = Math.min(Math.max(limit, 1), 100);
    const qb = this.rooms.createQueryBuilder('r').orderBy('r.scheduledAt', 'DESC');
    if (actor.role !== Role.SUPERADMIN) {
      qb.andWhere('r.organizationId IN (:...orgs)', {
        orgs: actor.organizationIds?.length ? actor.organizationIds : ['00000000-0000-0000-0000-000000000000'],
      });
    }
    if (status) qb.andWhere('r.status = :status', { status });
    const [data, total] = await qb.skip((Math.max(page, 1) - 1) * take).take(take).getManyAndCount();
    return { total, data: data.map((room) => this.publicRoom(room)) };
  }

  private publicRoom(room: ProctorRoom) {
    const snap = room.snapshot as { name?: string; code?: string };
    return {
      id: room.id,
      userId: room.userId,
      organizationId: room.organizationId,
      safetyRecordId: room.safetyRecordId,
      recordTypeCode: room.recordTypeCode,
      standardName: snap.name ?? '',
      standardCode: snap.code ?? '',
      scheduledAt: room.scheduledAt,
      expiresAt: room.expiresAt,
      status: room.status,
      attemptNumber: room.attemptNumber,
      accessToken: room.accessToken,
      notificationStatus: room.notificationStatus,
      connectionStatus: room.connectionStatus,
      lastSeenAt: room.lastSeenAt,
    };
  }

  async liveRooms(actor: Actor) {
    this.assertStaff(actor);
    const qb = this.rooms.createQueryBuilder('r').where('r.status IN (:...st)', {
      st: ['IN_PROGRESS', 'INTERRUPTED', 'PENDING_SYNC'],
    });
    if (actor.role !== Role.SUPERADMIN) {
      qb.andWhere('r.organizationId IN (:...orgs)', {
        orgs: actor.organizationIds?.length ? actor.organizationIds : ['00000000-0000-0000-0000-000000000000'],
      });
    }
    const rooms = await qb.orderBy('r.lastSeenAt', 'DESC', 'NULLS LAST').take(100).getMany();
    const attemptIds = (
      await Promise.all(rooms.map((room) => this.openAttempt(room.id)))
    ).filter((row): row is ProctorAttempt => !!row);
    return rooms.map((room) => {
      const attempt = attemptIds.find((row) => row.roomId === room.id) ?? null;
      const live = room.connectionStatus === 'ONLINE' && room.status === 'IN_PROGRESS';
      return {
        ...this.publicRoom(room),
        questionIndex: attempt?.questionIndex ?? 0,
        remainingMs: attempt?.remainingMs ?? null,
        media: attempt?.mediaStatus ?? {},
        live,
      };
    });
  }

  async monitor(roomId: string, actor: Actor) {
    const room = await this.requireRoom(roomId);
    this.assertOrg(actor, room.organizationId);
    const attempt = await this.openAttempt(room.id);
    const questions = attempt
      ? await this.attemptQuestions.find({ where: { attemptId: attempt.id }, order: { sortOrder: 'ASC' } })
      : [];
    const answers = attempt ? await this.answers.find({ where: { attemptId: attempt.id } }) : [];
    const recent = attempt
      ? await this.events.find({
          where: { attemptId: attempt.id },
          order: { occurredAt: 'DESC' },
          take: 30,
        })
      : [];
    const files = attempt ? await this.recordings.find({ where: { attemptId: attempt.id } }) : [];
    return {
      room: this.publicRoom(room),
      live: room.connectionStatus === 'ONLINE' && room.status === 'IN_PROGRESS',
      lastSeenAt: room.lastSeenAt,
      attempt: attempt
        ? {
            id: attempt.id,
            questionIndex: attempt.questionIndex,
            questionCount: questions.length,
            remainingMs: attempt.remainingMs,
            status: attempt.status,
            media: attempt.mediaStatus,
          }
        : null,
      questions: questions.map((row) => ({
        id: row.id,
        prompt: row.promptSnapshot,
        selected: answers.find((ans) => ans.attemptQuestionId === row.id)?.selectedOptionIds ?? [],
        correctOptionIds: row.optionsSnapshot.filter((opt) => opt.isCorrect).map((opt) => opt.id),
      })),
      events: recent,
      recordings: files,
      recordingGaps: this.gaps(files),
    };
  }

  private gaps(files: ProctorRecording[]) {
    const byKind = new Map<string, number[]>();
    for (const file of files) {
      const list = byKind.get(file.kind) ?? [];
      list.push(file.sequence);
      byKind.set(file.kind, list);
    }
    const missing: { kind: string; sequence: number }[] = [];
    for (const [kind, seqs] of byKind) {
      const max = Math.max(...seqs);
      for (let n = 1; n <= max; n += 1) {
        if (!seqs.includes(n)) missing.push({ kind, sequence: n });
      }
    }
    return missing;
  }

  async listViolations(actor: Actor, page = 1) {
    this.assertCentral(actor);
    const take = 30;
    const [data, total] = await this.violations.findAndCount({
      order: { occurredAt: 'DESC' },
      skip: (Math.max(page, 1) - 1) * take,
      take,
    });
    return { total, data };
  }

  async resultsForUser(userId: string, actor: Actor, detailed: boolean) {
    if (actor.role === Role.USER) assertAssignee(actor.id, userId);
    else {
      const user = await this.users.findOne({
        where: { id: userId },
        relations: ['organizations', 'organizations.organization'],
      });
      const orgId = user?.organizations?.[0]?.organization?.id;
      if (orgId) this.assertOrg(actor, orgId);
      else this.assertStaff(actor);
    }
    const rooms = await this.rooms.find({ where: { userId }, order: { scheduledAt: 'DESC' }, take: 50 });
    const roomIds = rooms.map((room) => room.id);
    const results = roomIds.length ? await this.results.find({ where: { roomId: In(roomIds) } }) : [];
    return results.map((result) => {
      const room = rooms.find((row) => row.id === result.roomId);
      const summary = toEmployeeResult({
        examinationName: String((room?.snapshot as { name?: string })?.name ?? ''),
        examDate: room?.scheduledAt.toISOString().slice(0, 10) ?? null,
        questionCount: result.questionCount,
        correctCount: result.correctCount,
        scorePercent: result.scorePercent,
        gradeLabel: result.gradeLabel,
        passed: result.passed,
        nextExamDate: result.nextExamDate,
        status: room?.status ?? 'COMPLETED',
      });
      return detailed ? { ...summary, roomId: result.roomId, requiresReview: result.requiresReview } : summary;
    });
  }

  async myRooms(actor: Actor) {
    const rooms = await this.rooms.find({
      where: { userId: actor.id },
      order: { scheduledAt: 'DESC' },
      take: 50,
    });
    const open = await Promise.all(rooms.map((room) => this.openAttempt(room.id)));
    return rooms.map((room, index) => ({
      ...this.publicRoom(room),
      remainingMs: open[index]?.remainingMs ?? null,
      questionIndex: open[index]?.questionIndex ?? 0,
      canStart: ['SCHEDULED', 'READY', 'IN_PROGRESS', 'INTERRUPTED', 'PENDING_SYNC'].includes(room.status),
    }));
  }

  async enter(token: string, actor: Actor) {
    const room = await this.rooms.findOne({ where: { accessToken: token } });
    if (!room) throw new NotFoundException('Xona topilmadi');
    try {
      assertAssignee(actor.id, room.userId);
    } catch {
      throw new ForbiddenException('Bu xona boshqa xodimga biriktirilgan');
    }
    return this.publicRoom(room);
  }

  async startOrResume(roomId: string, actor: Actor) {
    const room = await this.requireRoom(roomId);
    try {
      assertAssignee(actor.id, room.userId);
    } catch {
      throw new ForbiddenException('Bu xona boshqa xodimga biriktirilgan');
    }
    if (room.status === 'COMPLETED') throw new BadRequestException('Xona yakunlangan');
    if (room.status === 'CANCELLED' || room.status === 'EXPIRED') {
      throw new BadRequestException('Xona yopilgan');
    }
    const now = Date.now();
    if ((room.status === 'SCHEDULED' || room.status === 'READY' || room.status === 'DRAFT') && now < room.scheduledAt.getTime()) {
      throw new BadRequestException('Imtihon vaqti hali kelmagan');
    }
    if ((room.status === 'SCHEDULED' || room.status === 'READY') && now > room.expiresAt.getTime()) {
      room.status = 'EXPIRED';
      await this.rooms.save(room);
      throw new BadRequestException('Xona muddati o‘tgan');
    }
    let attempt = await this.openAttempt(room.id);
    if (!attempt) {
      attempt = await this.createAttempt(room);
      room.attemptNumber = attempt.attemptNumber;
      room.status = 'IN_PROGRESS';
    } else {
      const resumed = resumeTimer(
        {
          status: attempt.status as RoomStatus,
          remainingMs: attempt.remainingMs,
          lastTickAt: attempt.lastTickAt?.getTime() ?? null,
          questionIndex: attempt.questionIndex,
        },
        now,
      );
      attempt.status = 'IN_PROGRESS';
      attempt.remainingMs = resumed.remainingMs;
      attempt.questionIndex = resumed.questionIndex;
      attempt.lastTickAt = new Date(now);
      attempt.interruptedAt = null;
      await this.attempts.save(attempt);
      room.status = 'IN_PROGRESS';
    }
    room.connectionStatus = 'ONLINE';
    room.lastSeenAt = new Date(now);
    await this.rooms.save(room);
    return this.employeePaper(room, attempt);
  }

  private async createAttempt(room: ProctorRoom) {
    const snap = room.snapshot as ReturnType<ProctorService['snapshot']>;
    const links = await this.links.find({ where: { standardId: room.standardId } });
    const questions = await this.questions.find({
      where: { id: In(links.map((link) => link.questionId)) },
    });
    const pool = questions.map((row) => ({ id: row.id, category: row.category, active: row.isActive }));
    const attemptNumber = room.attemptNumber + 1;
    const seed = `${room.id}:${attemptNumber}`;
    const picked = selectQuestions(pool, snap, seed);
    const attempt = await this.attempts.save(
      this.attempts.create({
        roomId: room.id,
        attemptNumber,
        status: 'IN_PROGRESS',
        remainingMs: snap.durationMs,
        durationMs: snap.durationMs,
        questionIndex: 0,
        lastTickAt: new Date(),
        startedAt: new Date(),
        seed,
        mediaStatus: {},
      }),
    );
    const optionRows = await this.options.find({
      where: { questionId: In(picked.map((row) => row.id)) },
      order: { sortOrder: 'ASC' },
    });
    await this.attemptQuestions.save(
      picked.map((row) => {
        const question = questions.find((item) => item.id === row.id)!;
        const opts = optionRows.filter((opt) => opt.questionId === question.id);
        return this.attemptQuestions.create({
          attemptId: attempt.id,
          questionId: question.id,
          sortOrder: row.sortOrder,
          type: question.type,
          promptSnapshot: question.prompt,
          imageUrl: question.imageUrl,
          explanation: question.explanation,
          optionsSnapshot: opts.map((opt) => ({ id: opt.id, text: opt.text, isCorrect: opt.isCorrect })),
          optionOrder: orderOptions(opts, `${seed}:${question.id}`, snap.randomizeOptions),
        });
      }),
    );
    await this.addEvent(attempt, room.id, 'START', {});
    return attempt;
  }

  private async employeePaper(room: ProctorRoom, attempt: ProctorAttempt) {
    const questions = await this.attemptQuestions.find({
      where: { attemptId: attempt.id },
      order: { sortOrder: 'ASC' },
    });
    const saved = await this.answers.find({ where: { attemptId: attempt.id } });
    return {
      roomId: room.id,
      attemptId: attempt.id,
      status: room.status,
      remainingMs: attempt.remainingMs,
      questionIndex: attempt.questionIndex,
      recordingRequired: room.recordingRequired,
      maxRecordingMb: room.maxRecordingMb,
      questions: questions.map((row) => ({
        id: row.id,
        prompt: row.promptSnapshot,
        imageUrl: row.imageUrl,
        type: row.type,
        options: row.optionOrder.map((id) => {
          const opt = row.optionsSnapshot.find((item) => item.id === id);
          return { id, text: opt?.text ?? '' };
        }),
        selectedOptionIds: saved.find((ans) => ans.attemptQuestionId === row.id)?.selectedOptionIds ?? [],
      })),
      iceServers: this.iceServers(),
    };
  }

  iceServers() {
    const stun = process.env.PROCTOR_STUN_URL || 'stun:stun.l.google.com:19302';
    const servers: { urls: string; username?: string; credential?: string }[] = [{ urls: stun }];
    if (process.env.PROCTOR_TURN_URL) {
      servers.push({
        urls: process.env.PROCTOR_TURN_URL,
        username: process.env.PROCTOR_TURN_USERNAME,
        credential: process.env.PROCTOR_TURN_CREDENTIAL,
      });
    }
    return servers;
  }

  async saveAnswer(attemptId: string, dto: SaveAnswerDto, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    if (attempt.supersededAt || room.status === 'COMPLETED') {
      throw new BadRequestException('Urinish yopilgan');
    }
    const question = await this.attemptQuestions.findOne({
      where: { id: dto.attemptQuestionId, attemptId },
    });
    if (!question) throw new NotFoundException('Savol topilmadi');
    const allowed = new Set(question.optionOrder);
    if (dto.selectedOptionIds.some((id) => !allowed.has(id))) {
      throw new BadRequestException('Variant bu savolga tegishli emas');
    }
    const existing = await this.answers.findOne({
      where: { attemptId, attemptQuestionId: question.id },
    });
    if (existing) {
      existing.selectedOptionIds = dto.selectedOptionIds;
      await this.answers.save(existing);
    } else {
      await this.answers.save(
        this.answers.create({
          attemptId,
          attemptQuestionId: question.id,
          selectedOptionIds: dto.selectedOptionIds,
        }),
      );
    }
    if (dto.questionIndex != null) attempt.questionIndex = dto.questionIndex;
    await this.attempts.save(attempt);
    await this.addEvent(attempt, room.id, 'ANSWER', {
      attemptQuestionId: question.id,
      selectedOptionIds: dto.selectedOptionIds,
    });
    return { ok: true };
  }

  async heartbeat(attemptId: string, dto: HeartbeatDto, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    const now = Date.now();
    const next = tickTimer(
      {
        status: attempt.status as RoomStatus,
        remainingMs: attempt.remainingMs,
        lastTickAt: attempt.lastTickAt?.getTime() ?? null,
        questionIndex: attempt.questionIndex,
      },
      now,
    );
    attempt.remainingMs = next.remainingMs;
    attempt.lastTickAt = new Date(now);
    if (dto.questionIndex != null) attempt.questionIndex = dto.questionIndex;
    attempt.mediaStatus = {
      camera: dto.camera ?? false,
      microphone: dto.microphone ?? false,
      recording: dto.recording ?? false,
    };
    room.connectionStatus = 'ONLINE';
    room.lastSeenAt = new Date(now);
    await this.attempts.save(attempt);
    await this.rooms.save(room);
    if (next.expired) return this.submit(attemptId, actor);
    return { remainingMs: attempt.remainingMs, questionIndex: attempt.questionIndex };
  }

  async interrupt(attemptId: string, dto: InterruptDto, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    const now = Date.now();
    const frozen = interruptTimer(
      {
        status: attempt.status as RoomStatus,
        remainingMs: attempt.remainingMs,
        lastTickAt: attempt.lastTickAt?.getTime() ?? null,
        questionIndex: dto.questionIndex ?? attempt.questionIndex,
      },
      now,
      dto.frozenAt ? new Date(dto.frozenAt).getTime() : now,
    );
    attempt.status = 'INTERRUPTED';
    attempt.remainingMs = frozen.remainingMs;
    attempt.questionIndex = frozen.questionIndex;
    attempt.interruptedAt = new Date(now);
    room.status = 'INTERRUPTED';
    room.connectionStatus = 'OFFLINE';
    room.lastSeenAt = new Date(now);
    await this.attempts.save(attempt);
    await this.rooms.save(room);
    await this.addEvent(attempt, room.id, 'INTERRUPT', { remainingMs: attempt.remainingMs });
    return { remainingMs: attempt.remainingMs, questionIndex: attempt.questionIndex, status: room.status };
  }

  async addEvents(attemptId: string, dto: EventsDto, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    let stored = 0;
    for (const event of dto.events) {
      const saved = await this.addEvent(attempt, room.id, event.type, event.payload ?? {}, event.clientEventId, new Date(event.occurredAt));
      if (saved) stored += 1;
    }
    return { stored };
  }

  async reportSightings(attemptId: string, dto: SightingsDto, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    const found = detectRemoteTools(dto.sightings);
    for (const row of found) {
      await this.violations.save(
        this.violations.create({
          roomId: room.id,
          attemptId: attempt.id,
          userId: room.userId,
          code: row.code,
          processName: row.processName,
          windowTitle: row.windowTitle,
          occurredAt: new Date(),
          payload: {},
        }),
      );
    }
    return { stored: found.length };
  }

  async submit(attemptId: string, actor: Actor) {
    const loaded = await this.requireOwnAttempt(attemptId, actor);
    return this.dataSource.transaction(async (manager) => {
      const attempt = await manager.findOne(ProctorAttempt, {
        where: { id: loaded.attempt.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!attempt) throw new NotFoundException('Urinish topilmadi');
      const existing = await manager.findOne(ProctorResult, { where: { attemptId: attempt.id } });
      if (beginFinalize(existing?.id ?? null).duplicate && existing) return existing;
      const room = await manager.findOne(ProctorRoom, { where: { id: attempt.roomId } });
      if (!room) throw new NotFoundException('Xona topilmadi');
      const snap = room.snapshot as ReturnType<ProctorService['snapshot']>;
      const questions = await manager.find(ProctorAttemptQuestion, { where: { attemptId: attempt.id } });
      const answers = await manager.find(ProctorAnswer, { where: { attemptId: attempt.id } });
      const graded = gradeAttempt(
        questions.map((row) => ({
          id: row.id,
          type: row.type,
          correctOptionIds: row.optionsSnapshot.filter((opt) => opt.isCorrect).map((opt) => opt.id),
          selectedOptionIds: answers.find((ans) => ans.attemptQuestionId === row.id)?.selectedOptionIds ?? [],
        })),
        snap.passPercent,
        snap.gradeThresholds,
      );
      const examDay = new Date().toISOString().slice(0, 10);
      const next = nextExamDate(examDay, snap.nextExamRule);
      const result = await manager.save(
        manager.create(ProctorResult, {
          attemptId: attempt.id,
          roomId: room.id,
          safetyRecordId: room.safetyRecordId,
          correctCount: graded.correctCount,
          questionCount: graded.questionCount,
          scorePercent: graded.scorePercent,
          gradeLabel: graded.gradeLabel,
          passed: graded.passed,
          nextExamDate: next.date,
          requiresReview: next.requiresReview,
          finalizedAt: new Date(),
        }),
      );
      attempt.status = 'COMPLETED';
      attempt.submittedAt = new Date();
      attempt.remainingMs = 0;
      await manager.save(attempt);
      room.status = 'COMPLETED';
      room.connectionStatus = 'OFFLINE';
      await manager.save(room);
      const record = await manager.findOne(EmployeeSafetyRecord, { where: { id: room.safetyRecordId } });
      if (record) {
        record.grade = graded.gradeLabel;
        if (!next.requiresReview && next.date) record.nextExamDate = next.date;
        await manager.save(record);
      }
      if (room.createdBy) {
        try {
          await this.notifications.create({
            userId: room.createdBy,
            title: 'Imtihon yakunlandi',
            body: `${snap.name}: ${graded.scorePercent}%`,
            data: { type: 'proctor_result', roomId: room.id },
          });
        } catch {
          /* natija saqlangan, bildirishnoma ixtiyoriy */
        }
      }
      return result;
    });
  }

  async cancel(roomId: string, actor: Actor) {
    const room = await this.requireRoom(roomId);
    this.assertOrg(actor, room.organizationId);
    assertTransition(room.status as RoomStatus, 'CANCELLED');
    room.status = 'CANCELLED';
    await this.rooms.save(room);
    return this.publicRoom(room);
  }

  async restart(roomId: string, actor: Actor) {
    this.assertCentral(actor);
    const room = await this.requireRoom(roomId);
    const finalized = await this.results.findOne({ where: { roomId: room.id } });
    if (!canRestart(room.status as RoomStatus, !!finalized)) {
      throw new BadRequestException('Yakunlangan xona qayta boshlanmaydi');
    }
    const current = await this.openAttempt(room.id);
    if (current) {
      current.supersededAt = new Date();
      current.status = 'CANCELLED';
      await this.attempts.save(current);
    }
    const attempt = await this.createAttempt(room);
    room.attemptNumber = attempt.attemptNumber;
    room.status = 'IN_PROGRESS';
    room.connectionStatus = 'OFFLINE';
    await this.rooms.save(room);
    await this.addEvent(attempt, room.id, 'RESTART', { by: actor.id });
    return this.publicRoom(room);
  }

  async saveRecording(attemptId: string, dto: RecordingChunkDto, file: Buffer, actor: Actor) {
    const { room, attempt } = await this.requireOwnAttempt(attemptId, actor);
    if (!file?.length) throw new BadRequestException('Fayl bo‘sh');
    const checksum = createHash('sha256').update(file).digest('hex');
    if (dto.checksum && dto.checksum !== checksum) {
      throw new BadRequestException('Checksum mos emas');
    }
    const used = await this.recordings
      .createQueryBuilder('f')
      .select('COALESCE(SUM(f.sizeBytes), 0)', 'sum')
      .where('f.attemptId = :attemptId', { attemptId })
      .getRawOne<{ sum: string }>();
    const nextBytes = Number(used?.sum ?? 0) + file.length;
    if (nextBytes > room.maxRecordingMb * 1024 * 1024) {
      throw new BadRequestException('Yozuv hajmi chegarasiga yetdi. Mavjud bo‘laklar saqlanadi.');
    }
    const user = await this.users.findOne({ where: { id: room.userId } });
    const org = await this.orgs.findOne({ where: { id: room.organizationId } });
    const when = room.scheduledAt;
    const fileName = `${dto.kind}_${String(dto.sequence).padStart(3, '0')}.webm`;
    const relative = buildRecordingRelativePath({
      year: String(when.getUTCFullYear()),
      branch: org?.name ?? 'branch',
      month: String(when.getUTCMonth() + 1).padStart(2, '0'),
      section: room.recordTypeCode,
      employeeName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'xodim',
      login: user?.email ?? 'login',
      roomId: room.id,
      fileName,
    });
    const root = path.resolve(process.env.PROCTOR_RECORDINGS_DIR || path.join(process.cwd(), 'proctor-recordings'));
    const absolute = path.resolve(root, ...relative.split('/'));
    if (!absolute.startsWith(root)) throw new BadRequestException('Yo‘l rad etildi');
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, file);
    let row = await this.recordings.findOne({
      where: { attemptId, kind: dto.kind, sequence: dto.sequence },
    });
    if (!row) {
      row = this.recordings.create({
        attemptId,
        kind: dto.kind,
        sequence: dto.sequence,
        storagePath: relative,
        checksum,
        sizeBytes: file.length,
        durationMs: dto.durationMs ?? 0,
        uploadState: 'STORED',
      });
    } else {
      row.checksum = checksum;
      row.sizeBytes = file.length;
      row.durationMs = dto.durationMs ?? row.durationMs;
      row.uploadState = 'STORED';
      row.storagePath = relative;
    }
    const saved = await this.recordings.save(row);
    await this.uploads.save(
      this.uploads.create({
        recordingId: saved.id,
        attemptId,
        state: 'STORED',
        retries: 0,
        checkpointBytes: file.length,
      }),
    );
    return { ok: true, checksum, storagePath: relative, gaps: this.gaps(await this.recordings.find({ where: { attemptId } })) };
  }

  async assertWatch(actor: Actor, roomId: string) {
    const room = await this.requireRoom(roomId);
    if (actor.id === room.userId) return room;
    if (actor.role === Role.SUPERADMIN) return room;
    const organizationIds = actor.organizationIds?.length
      ? actor.organizationIds
      : await this.orgIds(actor.id);
    this.assertOrg({ ...actor, organizationIds }, room.organizationId);
    return room;
  }

  private async orgIds(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: ['organizations', 'organizations.organization'],
    });
    return (user?.organizations ?? [])
      .map((row) => row.organization?.id)
      .filter((id): id is string => !!id);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireDue() {
    await this.rooms.update(
      { status: In(['SCHEDULED', 'READY']), expiresAt: LessThan(new Date()) },
      { status: 'EXPIRED' },
    );
  }

  private async requireRoom(id: string) {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) throw new NotFoundException('Xona topilmadi');
    return room;
  }

  private async openAttempt(roomId: string) {
    return this.attempts.findOne({
      where: { roomId, supersededAt: IsNull() },
      order: { attemptNumber: 'DESC' },
    });
  }

  private async requireOwnAttempt(attemptId: string, actor: Actor) {
    const attempt = await this.attempts.findOne({ where: { id: attemptId } });
    if (!attempt || attempt.supersededAt) throw new NotFoundException('Urinish topilmadi');
    const room = await this.requireRoom(attempt.roomId);
    try {
      assertAssignee(actor.id, room.userId);
    } catch {
      throw new ForbiddenException('Bu xona boshqa xodimga biriktirilgan');
    }
    return { room, attempt };
  }

  private async addEvent(
    attempt: ProctorAttempt,
    roomId: string,
    type: string,
    payload: Record<string, unknown>,
    clientEventId?: string,
    occurredAt = new Date(),
  ) {
    try {
      return await this.events.save(
        this.events.create({
          attemptId: attempt.id,
          roomId,
          type,
          payload,
          clientEventId: clientEventId ?? null,
          occurredAt,
        }),
      );
    } catch (error) {
      const code = (error as { code?: string; driverError?: { code?: string } }).code
        ?? (error as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23505') return null;
      throw error;
    }
  }
}
