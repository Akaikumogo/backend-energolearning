import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { REPORTING_ROLES, Role } from '../common/enums/role.enum';
import {
  EnergoIdAuthClient,
  EnergoIdUser,
} from '../auth/energo-id-auth.client';
import { UsersService } from '../users/users.service';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { EmployeeSyncSetting } from '../database/entities/employee-sync-setting.entity';
import { TerminatedEmployee } from '../database/entities/terminated-employee.entity';
import { Department } from '../database/entities/department.entity';
import { Position } from '../database/entities/position.entity';
import { NesSyncGateway } from './nes-sync.gateway';
import {
  normalizeOrganizationName,
  organizationNamesEquivalent,
} from '../common/utils/organization-name.normalize';
import {
  resolvePersonnelNumber,
  withPersonnelNumberSuffix,
} from '../common/utils/personnel-number.util';

@Injectable()
export class NesEmployeesService {
  private readonly logger = new Logger(NesEmployeesService.name);
  private activeSyncEnergoIds = new Set<string>();

  private syncState: {
    running: boolean;
    phase: 'UPSERT' | 'FINALIZING';
    current: number;
    total: number;
    upserted: number;
    hidden: number;
    startedAt: Date | null;
    finishedAt: Date | null;
    status: 'IDLE' | 'RUNNING' | 'SUCCESS' | 'FAILED';
    errorMessage: string | null;
  } = {
    running: false,
    phase: 'UPSERT',
    current: 0,
    total: 0,
    upserted: 0,
    hidden: 0,
    startedAt: null,
    finishedAt: null,
    status: 'IDLE',
    errorMessage: null,
  };

  private lastCompletedSync: ReturnType<
    NesEmployeesService['buildSyncView']
  > | null = null;

  getSyncStatus() {
    return this.buildSyncView();
  }

  getSyncHealth() {
    const runningSync = this.syncState.running ? this.buildSyncView() : null;
    return {
      runningSync,
      latestSync: runningSync ?? this.lastCompletedSync,
    };
  }

  private buildSyncView() {
    const {
      current,
      total,
      upserted,
      hidden,
      startedAt,
      finishedAt,
      running,
      phase,
      status,
      errorMessage,
    } = this.syncState;
    const progressPercent =
      total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const durationMs =
      startedAt && finishedAt
        ? finishedAt.getTime() - startedAt.getTime()
        : startedAt && running
          ? Date.now() - startedAt.getTime()
          : null;

    return {
      running,
      phase,
      status,
      processed: current,
      current,
      total,
      upserted,
      hidden,
      progressPercent,
      startedAt: startedAt?.toISOString() ?? null,
      finishedAt: finishedAt?.toISOString() ?? null,
      durationMs,
      errorMessage,
    };
  }

  constructor(
    @InjectRepository(NesEmployee)
    private readonly employeeRepo: Repository<NesEmployee>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(EmployeeSyncSetting)
    private readonly syncSettingRepo: Repository<EmployeeSyncSetting>,
    @InjectRepository(TerminatedEmployee)
    private readonly terminatedRepo: Repository<TerminatedEmployee>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    private readonly dataSource: DataSource,
    private readonly nesSyncGateway: NesSyncGateway,
    private readonly energoIdAuthClient: EnergoIdAuthClient,
    private readonly usersService: UsersService,
  ) {}

  @Cron('* * * * *', { timeZone: 'Asia/Tashkent' })
  async syncBySchedule() {
    try {
      if (!this.energoIdAuthClient.isConfigured()) return;
      await this.syncFromEnergoIdIfDue();
    } catch (error) {
      this.logger.error('Energo ID employee scheduled sync failed', error as Error);
    }
  }

  async syncFromNes() {
    if (!this.energoIdAuthClient.isConfigured()) {
      throw new ServiceUnavailableException(
        'ENERGO_ID_BASE_URL sozlanmagan. Xodimlar faqat Energo ID orqali sinxronlanadi.',
      );
    }

    if (this.syncState.running) {
      return {
        started: false,
        running: true,
        sync: this.buildSyncView(),
      };
    }

    const lockAcquired = await this.trySyncLock();
    if (!lockAcquired) {
      return { success: false, skipped: true, reason: 'sync-lock-active' };
    }

    this.initSyncRun();
    void this.runSyncJob();
    return {
      started: true,
      running: true,
      sync: this.buildSyncView(),
    };
  }

  async checkEnergoIdHealth() {
    if (!this.energoIdAuthClient.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        message: 'ENERGO_ID_BASE_URL sozlanmagan',
      };
    }
    try {
      const response = await this.energoIdAuthClient.listEmployees();
      return {
        configured: true,
        reachable: true,
        employeeCount: response.employees.length,
        sync: response.sync,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        message: error instanceof Error ? error.message : 'Energo ID ulanmadi',
      };
    }
  }

  private async syncFromEnergoId() {
    if (this.syncState.running) return;

    const lockAcquired = await this.trySyncLock();
    if (!lockAcquired) return;

    this.initSyncRun();
    await this.runSyncJob();
  }

  private initSyncRun() {
    this.syncState = {
      running: true,
      phase: 'UPSERT',
      current: 0,
      total: 0,
      upserted: 0,
      hidden: 0,
      startedAt: new Date(),
      finishedAt: null,
      status: 'RUNNING',
      errorMessage: null,
    };
    this.emitProgressUpdate();
  }

  private async runSyncJob() {
    try {
      await this.syncOrganizationsFromEnergoId();
      await this.syncDepartmentsFromEnergoId();
      await this.syncPositionsFromEnergoId();

      const response = await this.energoIdAuthClient.listEmployees();
      const employees = response.employees;
      if (employees.length === 0) {
        // Bo'sh ro'yxat odatda Energo ID tomonidagi vaqtinchalik nosozlik —
        // bunda mavjud xodimlarning energo_id sini o'chirib yubormaymiz,
        // aks holda barcha foydalanuvchilar admin ro'yxatlaridan yo'qoladi.
        throw new Error(
          'Energo ID bo`sh xodimlar ro`yxati qaytardi — sync bekor qilindi, mavjud xodimlar yashirilmadi',
        );
      }
      await this.upsertSyncSetting(response.sync);
      this.syncState.total = employees.length;
      this.activeSyncEnergoIds = new Set(
        employees.map((employee) => employee.energoUserId),
      );
      this.emitProgressUpdate();

      let upserted = 0;
      for (const employee of employees) {
        const user = await this.usersService.syncFromEnergoIdentity(employee);
        await this.upsertEnergoEmployeeMirror(user, employee);
        upserted += 1;
        this.syncState.current = upserted;
        this.syncState.upserted = upserted;
        if (upserted % 5 === 0 || upserted === employees.length) {
          this.emitProgressUpdate();
        }
      }

      const backfilled = await this.backfillMissingNesMirrors(employees);
      if (backfilled > 0) {
        this.logger.log(
          `Energo ID sync: ${backfilled} ta xodim uchun nes mirror tiklandi`,
        );
      }

      const relinked = await this.relinkMirrorsToSyncedUsers(employees);
      if (relinked > 0) {
        this.logger.log(
          `Energo ID sync: ${relinked} ta nes mirror to'g'ri foydalanuvchiga bog'landi`,
        );
      }

      const activeEnergoIds = employees
        .map((employee) => employee.energoUserId?.trim())
        .filter((id): id is string => Boolean(id));

      this.syncState.phase = 'FINALIZING';
      this.emitProgressUpdate();

      const hidden = await this.finalizeMissingEnergoEmployees(activeEnergoIds);
      const cleaned = await this.cleanupStaleNesMirrors();
      if (cleaned.duplicatesRemoved > 0 || cleaned.orphansRemoved > 0) {
        this.logger.log(
          `Sync finalize cleanup: dup=${cleaned.duplicatesRemoved}, orphan=${cleaned.orphansRemoved}`,
        );
      }

      this.syncState.hidden = hidden;
      this.syncState.status = 'SUCCESS';
      this.syncState.finishedAt = new Date();
      this.syncState.running = false;
      this.lastCompletedSync = this.buildSyncView();

      const result = {
        success: true,
        source: 'energo-id',
        total: employees.length,
        processed: employees.length,
        upserted,
        hidden,
      };
      this.logger.log(
        `Energo ID sync tugadi: total=${employees.length}, upserted=${upserted}, hidden=${hidden}`,
      );
      this.nesSyncGateway.emitDone(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Energo ID sync xatosi';
      this.syncState.status = 'FAILED';
      this.syncState.errorMessage = message;
      this.syncState.finishedAt = new Date();
      this.syncState.running = false;
      this.lastCompletedSync = this.buildSyncView();
      this.nesSyncGateway.emitError(message);
      this.logger.error('Energo ID employee sync failed', error as Error);
    } finally {
      this.activeSyncEnergoIds = new Set();
      await this.releaseSyncLock();
    }
  }

  private emitProgressUpdate() {
    const view = this.buildSyncView();
    this.nesSyncGateway.emitProgress(
      view.processed,
      view.total,
      view.upserted,
      view.progressPercent,
    );
  }

  private async trySyncLock() {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS "app_sync_locks" (
        "name" text PRIMARY KEY,
        "locked_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await this.dataSource.query(
      `DELETE FROM "app_sync_locks"
       WHERE "name" = $1 AND "locked_at" < now() - interval '2 hours'`,
      ['elektrolearn-energo-employee-sync'],
    );
    const rows = await this.dataSource.query(
      `INSERT INTO "app_sync_locks"("name")
       VALUES ($1)
       ON CONFLICT ("name") DO NOTHING
       RETURNING "name"`,
      ['elektrolearn-energo-employee-sync'],
    );
    return rows.length > 0;
  }

  private async releaseSyncLock() {
    await this.dataSource
      .query('DELETE FROM "app_sync_locks" WHERE "name" = $1', [
        'elektrolearn-energo-employee-sync',
      ])
      .catch(() => undefined);
  }

  async listTerminatedEmployees(filters?: {
    search?: string;
    page?: number;
    limit?: number;
    allowedOrgIds?: string[] | null;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    if (filters?.allowedOrgIds && filters.allowedOrgIds.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    const qb = this.terminatedRepo
      .createQueryBuilder('t')
      .orderBy('t.terminatedAt', 'DESC');

    if (filters?.allowedOrgIds?.length) {
      const orgs = await this.orgRepo.find({
        where: { id: In(filters.allowedOrgIds) },
        select: ['name'],
      });
      const names = orgs.map((o) => o.name.trim().toLowerCase()).filter(Boolean);
      if (!names.length) {
        return { data: [], total: 0, page, limit };
      }
      qb.andWhere('LOWER(t.organization_name) IN (:...names)', { names });
    }

    if (filters?.search?.trim()) {
      qb.andWhere(
        `LOWER(t.first_name) LIKE :q OR LOWER(t.last_name) LIKE :q OR LOWER(t.login) LIKE :q OR LOWER(t.personnel_number) LIKE :q`,
        { q: `%${filters.search.trim().toLowerCase()}%` },
      );
    }

    const total = await qb.getCount();
    const rows = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    const data = rows.map((row) => {
      const snap = row.snapshot as {
        middleName?: string;
        employee?: { middle_name?: string };
      } | null;
      const middleName =
        (typeof snap?.middleName === 'string' && snap.middleName.trim()) ||
        (typeof snap?.employee?.middle_name === 'string' &&
          snap.employee.middle_name.trim()) ||
        null;
      return { ...row, middleName };
    });
    return { data, total, page, limit };
  }

  private async syncFromEnergoIdIfDue() {
    const setting = await this.getSyncSetting();
    const today = this.todayInTashkent();
    if (setting.lastRunDate === today) return;
    if (this.currentTimeInTashkent() !== setting.dailySyncTime) return;

    await this.syncFromEnergoId();
    await this.syncSettingRepo.update(setting.id, {
      lastRunDate: today,
      lastRunAt: new Date(),
    });
  }

  private async upsertSyncSetting(sync: {
    dailySyncTime: string;
    timezone: string;
  }) {
    const safeTime = /^\d{2}:\d{2}$/.test(sync.dailySyncTime)
      ? sync.dailySyncTime
      : '23:45';
    const existing = await this.syncSettingRepo.findOne({
      where: { source: 'energo-id' },
    });
    if (existing) {
      await this.syncSettingRepo.update(existing.id, {
        dailySyncTime: safeTime,
        timezone: sync.timezone || 'Asia/Tashkent',
      });
      return;
    }
    await this.syncSettingRepo.save(
      this.syncSettingRepo.create({
        source: 'energo-id',
        dailySyncTime: safeTime,
        timezone: sync.timezone || 'Asia/Tashkent',
        lastRunDate: null,
        lastRunAt: null,
      }),
    );
  }

  private async getSyncSetting() {
    const existing = await this.syncSettingRepo.findOne({
      where: { source: 'energo-id' },
    });
    if (existing) return existing;
    return this.syncSettingRepo.save(
      this.syncSettingRepo.create({
        source: 'energo-id',
        dailySyncTime: '23:45',
        timezone: 'Asia/Tashkent',
        lastRunDate: null,
        lastRunAt: null,
      }),
    );
  }

  /**
   * Sync payloadda yo‘q xodimlarni arxivlash + energo_id tozalash + nes mirror o‘chirish.
   * Katta ro‘yxatda TypeORM NOT IN ishonchsiz — temp table + anti-join ishlatiladi.
   */
  private async finalizeMissingEnergoEmployees(
    activeEnergoIds: string[],
  ): Promise<number> {
    if (activeEnergoIds.length === 0) {
      this.logger.warn(
        'finalizeMissing: activeEnergoIds bo‘sh — hech narsa arxivlanmadi',
      );
      return 0;
    }

    const uniqueIds = [...new Set(activeEnergoIds.map((id) => id.trim()).filter(Boolean))];

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`
        CREATE TEMP TABLE sync_active_energo_ids (
          id uuid PRIMARY KEY
        ) ON COMMIT DROP
      `);

      const chunkSize = 500;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        await manager.query(
          `INSERT INTO sync_active_energo_ids (id)
           SELECT UNNEST($1::uuid[])
           ON CONFLICT DO NOTHING`,
          [chunk],
        );
      }

      const staleUsers: Array<{
        id: string;
        energo_id: string;
        email: string;
        first_name: string;
        last_name: string;
      }> = await manager.query(`
        SELECT u.id, u.energo_id, u.email, u.first_name, u.last_name
        FROM users u
        WHERE u.role = $1
          AND u.energo_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sync_active_energo_ids a WHERE a.id = u.energo_id
          )
      `, [Role.USER]);

      for (const user of staleUsers) {
        const employees: Array<{
          personnel_number: string | null;
          organization_name: string | null;
          division: string | null;
          post: string | null;
          middle_name?: string | null;
        }> = await manager.query(
          `SELECT personnel_number, organization_name, division, post, middle_name
           FROM nes_employees WHERE user_id = $1 LIMIT 1`,
          [user.id],
        );
        const employee = employees[0];

        await manager.query(
          `INSERT INTO terminated_employees (
             user_id, energo_id, personnel_number, login,
             first_name, last_name, organization_name, division, post,
             snapshot, terminated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW()
           )`,
          [
            user.id,
            user.energo_id,
            employee?.personnel_number ?? null,
            user.email,
            user.first_name ?? '',
            user.last_name ?? '',
            employee?.organization_name ?? null,
            employee?.division ?? '',
            employee?.post ?? '',
            JSON.stringify({
              user,
              employee: employee ?? null,
              middleName: employee?.middle_name ?? '',
            }),
          ],
        );
      }

      const hideRows: Array<{ cnt: string }> = await manager.query(`
        WITH updated AS (
          UPDATE users u
          SET
            energo_id = NULL,
            report_active = false,
            login_blocked = true,
            password_hash = NULL,
            updated_at = NOW()
          WHERE u.role = $1
            AND u.energo_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM sync_active_energo_ids a WHERE a.id = u.energo_id
            )
          RETURNING u.id
        )
        SELECT COUNT(*)::int AS cnt FROM updated
      `, [Role.USER]);

      const staleIds = staleUsers.map((u) => u.id);
      if (staleIds.length > 0) {
        for (let i = 0; i < staleIds.length; i += chunkSize) {
          const chunk = staleIds.slice(i, i + chunkSize);
          await manager.query(
            `DELETE FROM nes_employees WHERE user_id = ANY($1::uuid[])`,
            [chunk],
          );
        }
      }

      // Orphan mirror: user yo‘q yoki energo_id null / syncda yo‘q
      await manager.query(`
        DELETE FROM nes_employees e
        USING users u
        WHERE e.user_id = u.id
          AND u.role = $1
          AND (
            u.energo_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM sync_active_energo_ids a WHERE a.id = u.energo_id
            )
          )
      `, [Role.USER]);

      const hidden = Number(hideRows[0]?.cnt ?? staleUsers.length);

      this.logger.log(
        `finalizeMissing: archived=${staleUsers.length}, hidden=${hidden}, active=${uniqueIds.length}`,
      );
      return Math.max(hidden, staleUsers.length);
    });
  }

  private async backfillMissingNesMirrors(
    employees: EnergoIdUser[],
  ): Promise<number> {
    const byEnergoId = new Map(
      employees.map((employee) => [employee.energoUserId, employee]),
    );

    const missingUsers = await this.userRepo
      .createQueryBuilder('u')
      .leftJoin('nes_employees', 'nes', 'nes.user_id = u.id')
      .where('u.role IN (:...reportingRoles)', {
        reportingRoles: [...REPORTING_ROLES],
      })
      .andWhere('u.energo_id IS NOT NULL')
      .andWhere('nes.id IS NULL')
      .getMany();

    let repaired = 0;
    for (const user of missingUsers) {
      const energoId = user.energoId?.trim();
      if (!energoId) continue;

      // Faqat shu sync payloaddagi userlar uchun mirror tiklash —
      // aks holda "keraksiz" odamlar qayta paydo bo‘ladi.
      const employee = byEnergoId.get(energoId);
      if (!employee) continue;

      await this.upsertEnergoEmployeeMirror(user, employee);
      repaired += 1;
    }

    return repaired;
  }

  private async relinkMirrorsToSyncedUsers(
    employees: EnergoIdUser[],
  ): Promise<number> {
    let relinked = 0;

    for (const employee of employees) {
      const personnelNumber = resolvePersonnelNumber(employee);
      if (!personnelNumber) continue;

      const user = await this.userRepo.findOne({
        where: { energoId: employee.energoUserId },
      });
      if (!user) continue;

      const mirrors = await this.employeeRepo.find({
        where: { personnelNumber },
      });

      for (const mirror of mirrors) {
        if (mirror.userId === user.id) continue;

        const holder = await this.userRepo.findOne({
          where: { id: mirror.userId },
          select: ['id', 'energoId'],
        });
        const holderEnergoId = holder?.energoId?.trim() || null;
        if (holderEnergoId === employee.energoUserId) continue;

        if (
          holderEnergoId &&
          this.activeSyncEnergoIds.has(holderEnergoId) &&
          holderEnergoId !== employee.energoUserId
        ) {
          continue;
        }

        mirror.userId = user.id;
        mirror.login = employee.login;
        mirror.lastSyncedAt = new Date();
        await this.employeeRepo.save(mirror);
        relinked += 1;
      }
    }

    return relinked;
  }

  private async shouldReuseNesMirror(
    mirror: NesEmployee,
    user: User,
    employee: EnergoIdUser,
  ): Promise<boolean> {
    if (mirror.userId === user.id) return true;

    const holder = await this.userRepo.findOne({
      where: { id: mirror.userId },
      select: ['id', 'energoId', 'role'],
    });
    if (!holder || holder.role !== Role.USER) return true;

    const holderEnergoId = holder.energoId?.trim() || null;
    const targetEnergoId =
      employee.energoUserId?.trim() || user.energoId?.trim() || null;

    if (!holderEnergoId) return true;
    if (holderEnergoId === targetEnergoId) return true;
    if (this.activeSyncEnergoIds.has(holderEnergoId)) return false;

    return true;
  }

  private async findNesMirrorForUpsert(
    user: User,
    employee: EnergoIdUser,
    personnelNumber: string,
    organizationName: string,
  ): Promise<NesEmployee | null> {
    const byUser = await this.employeeRepo.findOne({
      where: { userId: user.id },
    });
    if (byUser) return byUser;

    const candidates = await this.employeeRepo.find({
      where: [{ personnelNumber, organizationName }, { personnelNumber }],
      order: { lastSyncedAt: 'DESC' },
    });

    for (const candidate of candidates) {
      if (await this.shouldReuseNesMirror(candidate, user, employee)) {
        return candidate;
      }
    }

    return null;
  }

  private isDuplicatePersonnelOrgError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('duplicate key') ||
      message.includes('UQ_nes_employee_number_org') ||
      message.includes('nes_employees_personnel_number_key')
    );
  }

  /** Bir filialda (organization_id/name) tabel raqam bandligini tekshiradi. */
  private async hasPersonnelOrgConflict(
    candidate: string,
    organizationId: string,
    organizationName: string,
    userId: string,
    excludeMirrorId?: string | null,
  ): Promise<boolean> {
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .where('e.personnel_number = :candidate', { candidate })
      .andWhere(
        '(e.organization_id = :organizationId OR TRIM(e.organization_name) = TRIM(:organizationName))',
        { organizationId, organizationName: organizationName.trim() },
      );

    if (excludeMirrorId) {
      qb.andWhere('e.id != :excludeMirrorId', { excludeMirrorId });
    }

    const conflict = await qb.getOne();
    if (!conflict) return false;
    if (conflict.userId === userId) return false;
    return true;
  }

  /** Bir filialda bir xil tabel raqam bo'lsa oxiriga 1, 2, ... qo'shib noyob qiladi. */
  private async resolveUniquePersonnelNumberInOrg(
    basePersonnelNumber: string,
    organizationId: string,
    organizationName: string,
    userId: string,
    existingMirrorId?: string | null,
    startSuffix = 0,
  ): Promise<string> {
    for (let suffix = startSuffix; suffix <= 99; suffix += 1) {
      const candidate = withPersonnelNumberSuffix(basePersonnelNumber, suffix);
      const hasConflict = await this.hasPersonnelOrgConflict(
        candidate,
        organizationId,
        organizationName,
        userId,
        existingMirrorId,
      );
      if (!hasConflict) return candidate;
    }

    const fallback = `${basePersonnelNumber}${Date.now() % 10000}`;
    this.logger.warn(
      `Tabel raqam noyoblashtirilmadi (${basePersonnelNumber}, ${organizationName}) — ${fallback} ishlatildi`,
    );
    return fallback;
  }

  private async persistNesEmployeeMirror(
    basePersonnelNumber: string,
    organizationId: string,
    organizationName: string,
    userId: string,
    payload: Omit<
      Partial<NesEmployee>,
      'personnelNumber' | 'userId' | 'organizationId' | 'organizationName'
    >,
    existing: NesEmployee | null,
    login: string,
  ): Promise<void> {
    let mirror = existing;
    let startSuffix = 0;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const personnelNumber = await this.resolveUniquePersonnelNumberInOrg(
        basePersonnelNumber,
        organizationId,
        organizationName,
        userId,
        mirror?.id,
        startSuffix,
      );
      startSuffix =
        personnelNumber === basePersonnelNumber
          ? 1
          : Number.parseInt(personnelNumber.slice(basePersonnelNumber.length), 10) + 1;

      const record = {
        ...payload,
        personnelNumber,
        userId,
        organizationId,
        organizationName,
      };

      try {
        if (!mirror) {
          mirror = await this.employeeRepo.save(this.employeeRepo.create(record));
        } else {
          Object.assign(mirror, record);
          mirror = await this.employeeRepo.save(mirror);
        }

        if (personnelNumber !== basePersonnelNumber) {
          this.logger.warn(
            `Filial "${organizationName}" da tabel ${basePersonnelNumber} band — ${personnelNumber} ishlatildi: ${login}`,
          );
        }
        return;
      } catch (error) {
        if (!this.isDuplicatePersonnelOrgError(error)) throw error;

        mirror =
          (await this.employeeRepo.findOne({ where: { userId } })) ?? mirror;
        this.logger.warn(
          `Tabel ${personnelNumber} duplicate, qayta uriniladi: ${login}`,
        );
      }
    }

    throw new Error(`nes mirror saqlanmadi: ${login}`);
  }

  private async upsertEnergoEmployeeMirror(user: User, employee: EnergoIdUser) {
    const organization = await this.resolveEmployeeOrganization(employee);
    await this.attachUserToOrganization(user.id, organization.id);

    const organizationName = organization.name.trim();
    const organizationId = organization.id;

    const basePersonnelNumber = resolvePersonnelNumber(employee);
    if (!basePersonnelNumber) {
      this.logger.warn(
        `Tabel raqami topilmadi, mirror o'tkazib yuborildi: ${employee.login}`,
      );
      return;
    }

    const existing = await this.findNesMirrorForUpsert(
      user,
      employee,
      basePersonnelNumber,
      organizationName,
    );

    await this.persistNesEmployeeMirror(
      basePersonnelNumber,
      organizationId,
      organizationName,
      user.id,
      {
        division: employee.division ?? '',
        post: employee.post ?? '',
        fullName: [
          employee.lastName ?? '',
          employee.firstName ?? '',
          employee.middleName ?? '',
        ]
          .map((p) => p.trim())
          .filter(Boolean)
          .join(' '),
        lastName: employee.lastName ?? '',
        firstName: employee.firstName ?? '',
        middleName: employee.middleName?.trim() || '',
        modifiedAt: null,
        hiredAt: null,
        login: employee.login,
        initialPassword:
          employee.initialPassword ?? existing?.initialPassword ?? null,
        rawPayload: {
          ...(employee as unknown as Record<string, unknown>),
          firstName1c: employee.firstName1c ?? employee.firstName ?? '',
          lastName1c: employee.lastName1c ?? employee.lastName ?? '',
          middleName1c: employee.middleName1c ?? employee.middleName ?? '',
          division1c: employee.division1c ?? employee.division ?? '',
          post1c: employee.post1c ?? employee.post ?? '',
        },
        lastSyncedAt: new Date(),
      },
      existing,
      employee.login,
    );
    await this.syncUserInitialPassword(user.id, employee.initialPassword);
  }

  private async syncUserInitialPassword(
    userId: string,
    initialPassword?: string | null,
  ) {
    const plain = initialPassword?.trim();
    if (!plain) return;
    await this.userRepo.update(userId, { initialPassword: plain });
  }

  async listEmployees(filters?: {
    search?: string;
    organizationName?: string;
    division?: string;
    page?: number;
    limit?: number;
    allowedOrgIds?: string[] | null;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    if (filters?.allowedOrgIds && filters.allowedOrgIds.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    // Birinchi sahifa ochilganda dublikat / orphan mirrorlarni tozalash
    if (
      page === 1 &&
      !filters?.search?.trim() &&
      !filters?.organizationName?.trim() &&
      !filters?.division?.trim() &&
      !filters?.allowedOrgIds
    ) {
      await this.cleanupStaleNesMirrors();
    }

    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .innerJoin('e.user', 'u')
      .leftJoinAndSelect('e.organization', 'organization')
      .andWhere('u.energo_id IS NOT NULL')
      .andWhere('u.role IN (:...reportingRoles)', {
        reportingRoles: [...REPORTING_ROLES],
      })
      .orderBy('e.updatedAt', 'DESC');

    if (filters?.allowedOrgIds?.length) {
      qb.andWhere('e.organization_id IN (:...allowedOrgIds)', {
        allowedOrgIds: filters.allowedOrgIds,
      });
    }

    if (filters?.search) {
      qb.andWhere(
        `LOWER(e.fullName) LIKE :q OR LOWER(e.personnelNumber) LIKE :q OR LOWER(e.login) LIKE :q`,
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }

    if (filters?.organizationName) {
      qb.andWhere('LOWER(e.organizationName) = :org', {
        org: filters.organizationName.toLowerCase(),
      });
    }

    if (filters?.division) {
      qb.andWhere('LOWER(e.division) = :div', {
        div: filters.division.toLowerCase(),
      });
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
    return { data, total, page, limit };
  }

  /**
   * 1) Bir user uchun bir nechta mirror bo'lsa — eng yangisini qoldirish
   * 2) energo_id yo'q (arxiv) userlar mirrorini o'chirish
   */
  private async cleanupStaleNesMirrors(): Promise<{
    duplicatesRemoved: number;
    orphansRemoved: number;
  }> {
    const dupResult = await this.dataSource.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY last_synced_at DESC NULLS LAST, updated_at DESC, created_at DESC
          ) AS rn
        FROM nes_employees
      ),
      deleted AS (
        DELETE FROM nes_employees e
        USING ranked r
        WHERE e.id = r.id AND r.rn > 1
        RETURNING e.id
      )
      SELECT COUNT(*)::int AS cnt FROM deleted
    `);

    const orphanResult = await this.dataSource.query(
      `
      WITH deleted AS (
        DELETE FROM nes_employees e
        USING users u
        WHERE e.user_id = u.id
          AND (
            u.energo_id IS NULL
            OR u.role <> $1
          )
        RETURNING e.id
      )
      SELECT COUNT(*)::int AS cnt FROM deleted
    `,
      [Role.USER],
    );

    const duplicatesRemoved = Number(dupResult?.[0]?.cnt ?? 0);
    const orphansRemoved = Number(orphanResult?.[0]?.cnt ?? 0);
    if (duplicatesRemoved > 0 || orphansRemoved > 0) {
      this.logger.log(
        `nes_employees cleanup: duplicates=${duplicatesRemoved}, orphans=${orphansRemoved}`,
      );
    }
    return { duplicatesRemoved, orphansRemoved };
  }

  async getFilterOptions(allowedOrgIds?: string[] | null) {
    if (allowedOrgIds && allowedOrgIds.length === 0) {
      return { organizations: [], divisions: [] };
    }

    await this.cleanupStaleNesMirrors();

    const orgQb = this.orgRepo
      .createQueryBuilder('o')
      .select('o.name', 'name')
      .where('o.archived_at IS NULL')
      .andWhere(
        `EXISTS (
          SELECT 1
          FROM nes_employees e
          INNER JOIN users eu ON eu.id = e.user_id
          WHERE e.organization_id = o.id
            AND eu.energo_id IS NOT NULL
            AND eu.role IN (:...reportingRoles)
        )`,
        { reportingRoles: [...REPORTING_ROLES] },
      )
      .orderBy('o.name', 'ASC');

    if (allowedOrgIds?.length) {
      orgQb.andWhere('o.id IN (:...allowedOrgIds)', { allowedOrgIds });
    }

    const orgs = await orgQb.getRawMany<{ name: string }>();

    const divQb = this.employeeRepo
      .createQueryBuilder('e')
      .innerJoin('e.user', 'u')
      .select('DISTINCT e.division', 'division')
      .where('e.division IS NOT NULL AND e.division != :empty', { empty: '' })
      .andWhere('u.energo_id IS NOT NULL')
      .andWhere('u.role IN (:...reportingRoles)', {
        reportingRoles: [...REPORTING_ROLES],
      })
      .orderBy('e.division', 'ASC');

    if (allowedOrgIds?.length) {
      divQb.andWhere('e.organization_id IN (:...allowedOrgIds)', {
        allowedOrgIds,
      });
    }

    const divs = await divQb.getRawMany<{ division: string }>();

    return {
      organizations: orgs.map((r) => r.name).filter(Boolean),
      divisions: divs.map((r) => r.division),
    };
  }

  async getArchiveSummary(allowedOrgIds?: string[] | null) {
    if (allowedOrgIds && allowedOrgIds.length === 0) {
      return { employees: 0, questions: 0, modules: 0, theories: 0 };
    }

    let terminatedEmployees = 0;
    if (allowedOrgIds?.length) {
      const orgs = await this.orgRepo.find({
        where: { id: In(allowedOrgIds) },
        select: ['name'],
      });
      const names = orgs.map((o) => o.name.trim().toLowerCase()).filter(Boolean);
      if (names.length) {
        terminatedEmployees = await this.terminatedRepo
          .createQueryBuilder('t')
          .where('LOWER(t.organization_name) IN (:...names)', { names })
          .getCount();
      }
    } else {
      terminatedEmployees = await this.terminatedRepo.count();
    }

    return {
      employees: terminatedEmployees,
      questions: 0,
      modules: 0,
      theories: 0,
    };
  }

  /** @deprecated cutover-energo-id-fresh-start.mjs scriptidan foydalaning */
  async deleteAll() {
    if (this.syncState.running) {
      throw new BadRequestException('Sync ishlamoqda, avval tugashini kuting');
    }

    const employees = await this.employeeRepo.find({
      select: ['id', 'userId'],
    });
    const userIds = employees.map((e) => e.userId);

    await this.employeeRepo
      .createQueryBuilder()
      .delete()
      .from('nes_employees')
      .execute();

    if (userIds.length > 0) {
      await this.userRepo
        .createQueryBuilder()
        .delete()
        .from('users')
        .whereInIds(userIds)
        .execute();
    }

    return { success: true, deleted: employees.length };
  }

  private async syncOrganizationsFromEnergoId() {
    const branches = await this.energoIdAuthClient.listBranches();
    const activeBranchIds: string[] = [];
    const activeExternalIds: string[] = [];
    for (const branch of branches) {
      const branchId = String(branch.id);
      activeBranchIds.push(branchId);
      if (branch.externalId) {
        activeExternalIds.push(String(branch.externalId).trim());
      }
      await this.upsertOrganizationMirror({
        energoBranchId: branchId,
        name: String(branch.name ?? '').trim() || 'Unknown',
        externalId: branch.externalId ? String(branch.externalId).trim() : null,
        code: branch.code ? String(branch.code).trim() : null,
      });
    }
    const archived = await this.finalizeStaleOrganizations(
      activeBranchIds,
      activeExternalIds,
    );
    this.logger.log(
      `Energo ID filiallar: ${branches.length} ta, arxivlandi: ${archived}`,
    );
  }

  /**
   * Energo ID da yo‘q tashkilotlar: soft-archive (xodim/tarix saqlanadi).
   * Bo‘sh qo‘lda yaratilganlar o‘chiriladi.
   */
  private async finalizeStaleOrganizations(
    activeBranchIds: string[],
    activeExternalIds: string[],
  ): Promise<number> {
    let archived = 0;
    const now = new Date();
    const uniqueBranchIds = [...new Set(activeBranchIds.filter(Boolean))];
    const uniqueExternalIds = [...new Set(activeExternalIds.filter(Boolean))];

    // 1) Qo‘lda / mirror siz — bo‘sh bo‘lsa o‘chir, aks holda arxiv
    const manualCandidates = await this.orgRepo
      .createQueryBuilder('o')
      .where('o.energo_branch_id IS NULL')
      .andWhere('o.energo_external_id IS NULL')
      .andWhere('o.archived_at IS NULL')
      .getMany();

    for (const org of manualCandidates) {
      if (await this.canRemoveOrganization(org.id)) {
        await this.orgRepo.delete(org.id);
        archived += 1;
      } else {
        await this.orgRepo.update(org.id, { archivedAt: now });
        archived += 1;
      }
    }

    // 2) Energo branch_id bor, lekin hozirgi branches da yo‘q → arxiv
    if (uniqueBranchIds.length > 0) {
      const staleByBranch = await this.orgRepo
        .createQueryBuilder('o')
        .where('o.energo_branch_id IS NOT NULL')
        .andWhere('o.energo_branch_id NOT IN (:...ids)', { ids: uniqueBranchIds })
        .andWhere('o.archived_at IS NULL')
        .getMany();

      for (const org of staleByBranch) {
        if (await this.canRemoveOrganization(org.id)) {
          await this.orgRepo.delete(org.id);
        } else {
          await this.orgRepo.update(org.id, { archivedAt: now });
        }
        archived += 1;
      }
    }

    // 3) Faqat externalId bilan bog‘langan, lekin hozirgi branches da yo‘q
    if (uniqueExternalIds.length > 0) {
      const staleByExternal = await this.orgRepo
        .createQueryBuilder('o')
        .where('o.energo_branch_id IS NULL')
        .andWhere('o.energo_external_id IS NOT NULL')
        .andWhere('o.energo_external_id NOT IN (:...ext)', {
          ext: uniqueExternalIds,
        })
        .andWhere('o.archived_at IS NULL')
        .getMany();

      for (const org of staleByExternal) {
        if (await this.canRemoveOrganization(org.id)) {
          await this.orgRepo.delete(org.id);
        } else {
          await this.orgRepo.update(org.id, { archivedAt: now });
        }
        archived += 1;
      }
    }

    // 4) legacy-* nomlar
    const legacyOrgs = await this.orgRepo
      .createQueryBuilder('o')
      .where('o.name LIKE :prefix', { prefix: 'legacy-%' })
      .andWhere('o.archived_at IS NULL')
      .getMany();

    for (const org of legacyOrgs) {
      if (await this.canRemoveOrganization(org.id)) {
        await this.orgRepo.delete(org.id);
      } else {
        await this.orgRepo.update(org.id, { archivedAt: now });
      }
      archived += 1;
    }

    // 5) Aktiv Energo ID xodimi yo‘q filiallar → arxiv (tarix saqlanadi)
    const inactive = await this.orgRepo
      .createQueryBuilder('o')
      .where('o.archived_at IS NULL')
      .andWhere('o.is_default = false')
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM nes_employees e
          INNER JOIN users eu ON eu.id = e.user_id
          WHERE e.organization_id = o.id
            AND eu.energo_id IS NOT NULL
            AND eu.role IN ('USER', 'MODERATOR')
        )`,
      )
      .getMany();

    for (const org of inactive) {
      if (await this.canRemoveOrganization(org.id)) {
        await this.orgRepo.delete(org.id);
      } else {
        await this.orgRepo.update(org.id, { archivedAt: now });
      }
      archived += 1;
    }

    return archived;
  }

  private async canRemoveOrganization(orgId: string): Promise<boolean> {
    const userCount = await this.userOrgRepo.count({
      where: { organization: { id: orgId } },
    });
    if (userCount > 0) return false;
    const nesCount = await this.employeeRepo.count({
      where: { organizationId: orgId },
    });
    return nesCount === 0;
  }

  private async syncDepartmentsFromEnergoId() {
    try {
      const departments = await this.energoIdAuthClient.listDepartments();
      const now = new Date();
      let upserted = 0;
      for (const row of departments) {
        const displayName = String(row.name ?? '').trim();
        const sourceName = String(
          row.name1c ?? row.sourceName ?? row.name ?? '',
        ).trim();
        if (!displayName && !sourceName) continue;
        const existing =
          (sourceName
            ? await this.departmentRepo.findOne({ where: { name1c: sourceName } })
            : null) ??
          (await this.departmentRepo.findOne({ where: { name: displayName } }));
        const employeeCount = Number(row.employeeCount ?? 0) || 0;
        if (existing) {
          await this.departmentRepo.update(existing.id, {
            name: displayName || existing.name,
            name1c: sourceName || existing.name1c,
            employeeCount,
            lastSyncedAt: now,
          });
        } else {
          await this.departmentRepo.save(
            this.departmentRepo.create({
              name: displayName || sourceName,
              name1c: sourceName || displayName,
              employeeCount,
              lastSyncedAt: now,
            }),
          );
        }
        upserted += 1;
      }
      this.logger.log(`Energo ID bo‘limlar: ${upserted} ta`);
    } catch (error) {
      this.logger.warn(
        `Bo‘limlar sync o‘tkazib yuborildi: ${
          error instanceof Error ? error.message : 'xato'
        }`,
      );
    }
  }

  private async syncPositionsFromEnergoId() {
    try {
      const positions = await this.energoIdAuthClient.listPositions();
      let upserted = 0;
      for (const row of positions) {
        const displayTitle = String(row.name ?? '').trim();
        const sourceTitle = String(
          row.name1c ?? row.sourceName ?? row.name ?? '',
        ).trim();
        if (!displayTitle && !sourceTitle) continue;
        const existing =
          (sourceTitle
            ? await this.positionRepo.findOne({
                where: { title1c: sourceTitle },
                withDeleted: true,
              })
            : null) ??
          (await this.positionRepo.findOne({
            where: { title: displayTitle },
            withDeleted: true,
          }));
        if (existing) {
          if (existing.deletedAt) {
            await this.positionRepo.recover(existing);
          }
          await this.positionRepo.update(existing.id, {
            title: displayTitle || existing.title,
            title1c: sourceTitle || existing.title1c,
          });
        } else {
          await this.positionRepo.save(
            this.positionRepo.create({
              title: displayTitle || sourceTitle,
              title1c: sourceTitle || displayTitle,
            }),
          );
        }
        upserted += 1;
      }
      this.logger.log(`Energo ID lavozimlar: ${upserted} ta`);
    } catch (error) {
      this.logger.warn(
        `Lavozimlar sync o‘tkazib yuborildi: ${
          error instanceof Error ? error.message : 'xato'
        }`,
      );
    }
  }

  async listDepartmentsCatalog(filters?: { search?: string }) {
    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .orderBy('d.name', 'ASC');
    if (filters?.search?.trim()) {
      qb.andWhere('LOWER(d.name) LIKE :q', {
        q: `%${filters.search.trim().toLowerCase()}%`,
      });
    }
    const data = await qb.getMany();
    return { data, total: data.length };
  }

  private async resolveEmployeeOrganization(employee: EnergoIdUser) {
    const rawName = employee.organization?.name?.trim() || 'Unknown';
    const name = normalizeOrganizationName(rawName) || rawName;
    const externalId = employee.organization?.externalId?.trim() || null;
    return this.upsertOrganizationMirror({ name, externalId });
  }

  private async upsertOrganizationMirror(input: {
    energoBranchId?: string | null;
    name: string;
    externalId?: string | null;
    code?: string | null;
  }) {
    const rawName = input.name.trim() || 'Unknown';
    const name = normalizeOrganizationName(rawName) || rawName;
    let org: Organization | null = null;

    if (input.energoBranchId) {
      org = await this.orgRepo.findOne({
        where: { energoBranchId: input.energoBranchId },
      });
    }
    if (!org && input.externalId) {
      org = await this.orgRepo.findOne({
        where: { energoExternalId: input.externalId },
      });
    }
    if (!org) {
      org = await this.orgRepo.findOne({ where: { name } });
    }
    if (!org && rawName !== name) {
      org = await this.orgRepo.findOne({ where: { name: rawName } });
    }
    if (!org) {
      const candidates = await this.orgRepo
        .createQueryBuilder('o')
        .where('o.archived_at IS NULL')
        .getMany();
      org =
        candidates.find((candidate) =>
          organizationNamesEquivalent(candidate.name, name),
        ) ?? null;
    }

    if (!org) {
      return this.orgRepo.save(
        this.orgRepo.create({
          name,
          energoBranchId: input.energoBranchId ?? null,
          energoExternalId: input.externalId ?? null,
          branchCode: input.code ?? null,
          archivedAt: null,
        }),
      );
    }

    await this.releaseOrganizationName(name, org.id);

    await this.orgRepo.update(org.id, {
      name,
      energoBranchId: input.energoBranchId ?? org.energoBranchId,
      energoExternalId: input.externalId ?? org.energoExternalId,
      branchCode: input.code ?? org.branchCode,
      archivedAt: null,
    });

    return this.orgRepo.findOne({
      where: { id: org.id },
    }) as Promise<Organization>;
  }

  private async releaseOrganizationName(name: string, keepOrgId: string) {
    const conflict = await this.orgRepo.findOne({ where: { name } });
    if (!conflict || conflict.id === keepOrgId) return;

    const legacyName = `legacy-${conflict.id.slice(0, 8)}-${name}`.slice(0, 180);
    await this.orgRepo.update(conflict.id, { name: legacyName });
  }

  private async attachUserToOrganization(userId: string, organizationId: string) {
    await this.userOrgRepo
      .createQueryBuilder()
      .delete()
      .where('"userId" = :userId', { userId })
      .execute();
    await this.userOrgRepo.save(
      this.userOrgRepo.create({
        user: { id: userId } as User,
        organization: { id: organizationId } as Organization,
      }),
    );
  }

  private currentTimeInTashkent() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  private todayInTashkent() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  async patchEmployeeFields(
    userId: string,
    fields: Partial<{
      firstName: string | null;
      lastName: string | null;
      middleName: string | null;
      division: string | null;
      post: string | null;
    }>,
    changedByUserId: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.energoId) {
      throw new BadRequestException('Energo ID bilan bog`langan xodim topilmadi');
    }

    const resolved = (await this.energoIdAuthClient.patchEmployeeFields(
      user.energoId,
      fields,
      changedByUserId,
    )) as {
      firstName: string;
      lastName: string;
      middleName: string;
      division: string;
      post: string;
      firstName1c: string;
      lastName1c: string;
      middleName1c: string;
      division1c: string;
      post1c: string;
    };

    await this.userRepo.update(userId, {
      firstName: resolved.firstName,
      lastName: resolved.lastName,
    });

    const mirror = await this.employeeRepo.findOne({ where: { userId } });
    if (mirror) {
      await this.employeeRepo.update(mirror.id, {
        firstName: resolved.firstName,
        lastName: resolved.lastName,
        middleName: resolved.middleName,
        division: resolved.division,
        post: resolved.post,
        fullName: [resolved.lastName, resolved.firstName, resolved.middleName]
          .map((p) => p.trim())
          .filter(Boolean)
          .join(' '),
        rawPayload: {
          ...(mirror.rawPayload ?? {}),
          firstName1c: resolved.firstName1c,
          lastName1c: resolved.lastName1c,
          middleName1c: resolved.middleName1c,
          division1c: resolved.division1c,
          post1c: resolved.post1c,
        },
      });
    }

    return resolved;
  }

  async patchCatalogField(
    kind: 'department' | 'position',
    sourceName: string,
    name: string | null,
    changedByUserId: string,
  ) {
    await this.energoIdAuthClient.patchCatalogField(
      kind,
      sourceName,
      name,
      changedByUserId,
    );

    if (kind === 'department') {
      const existing = await this.departmentRepo.findOne({
        where: { name1c: sourceName },
      });
      if (existing) {
        await this.departmentRepo.update(existing.id, {
          name: name ?? sourceName,
          name1c: sourceName,
        });
      }
    } else {
      const existing = await this.positionRepo.findOne({
        where: { title1c: sourceName },
        withDeleted: true,
      });
      if (existing) {
        if (existing.deletedAt) await this.positionRepo.recover(existing);
        await this.positionRepo.update(existing.id, {
          title: name ?? sourceName,
          title1c: sourceName,
        });
      }
    }

    return { sourceName, name: name ?? sourceName };
  }
}
