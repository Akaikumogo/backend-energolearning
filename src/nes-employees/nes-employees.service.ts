import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
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
import { NesSyncGateway } from './nes-sync.gateway';
import {
  extractPersonnelNumberFromLogin,
  resolvePersonnelNumber,
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

      const response = await this.energoIdAuthClient.listEmployees();
      const employees = response.employees;
      if (employees.length === 0) {
        this.logger.warn(
          'Energo ID employee ro`yxati bo`sh — mavjud xodimlar yashiriladi',
        );
      } else {
        await this.upsertSyncSetting(response.sync);
      }
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

      const activeEnergoIds = employees.map((employee) => employee.energoUserId);

      this.syncState.phase = 'FINALIZING';
      this.emitProgressUpdate();

      await this.archiveMissingEnergoEmployees(activeEnergoIds);
      const hidden =
        await this.usersService.hideStaleEnergoUsers(activeEnergoIds);
      await this.removeMissingEnergoEmployeeMirrors();

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
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const qb = this.terminatedRepo
      .createQueryBuilder('t')
      .orderBy('t.terminatedAt', 'DESC');

    if (filters?.search?.trim()) {
      qb.andWhere(
        `LOWER(t.first_name) LIKE :q OR LOWER(t.last_name) LIKE :q OR LOWER(t.login) LIKE :q OR LOWER(t.personnel_number) LIKE :q`,
        { q: `%${filters.search.trim().toLowerCase()}%` },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();
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

  private async archiveMissingEnergoEmployees(activeEnergoIds: string[]) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.role = :role', { role: Role.USER })
      .andWhere('u.energo_id IS NOT NULL');

    if (activeEnergoIds.length > 0) {
      qb.andWhere('u.energo_id NOT IN (:...activeEnergoIds)', {
        activeEnergoIds,
      });
    }

    const users = await qb.getMany();
    for (const user of users) {
      const employee = await this.employeeRepo.findOne({
        where: { userId: user.id },
      });
      await this.terminatedRepo.save(
        this.terminatedRepo.create({
          userId: user.id,
          energoId: user.energoId,
          personnelNumber: employee?.personnelNumber ?? null,
          login: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          organizationName: employee?.organizationName ?? null,
          division: employee?.division ?? '',
          post: employee?.post ?? '',
          snapshot: {
            user,
            employee: employee ?? null,
          },
          terminatedAt: new Date(),
        }),
      );
    }
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
      .where('u.role = :role', { role: Role.USER })
      .andWhere('u.energo_id IS NOT NULL')
      .andWhere('nes.id IS NULL')
      .getMany();

    let repaired = 0;
    for (const user of missingUsers) {
      const energoId = user.energoId?.trim();
      if (!energoId) continue;

      const employee = byEnergoId.get(energoId);
      if (employee) {
        await this.upsertEnergoEmployeeMirror(user, employee);
        repaired += 1;
        continue;
      }

      const personnelNumber = extractPersonnelNumberFromLogin(user.email);
      if (!personnelNumber) continue;

      await this.upsertEnergoEmployeeMirror(user, {
        energoUserId: energoId,
        login: user.email,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: Role.USER,
        permissions: [],
        mustChangePassword: user.mustChangePassword,
        status: 'ACTIVE',
        personnelNumber,
        organization: null,
      });
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

  private async upsertEnergoEmployeeMirror(user: User, employee: EnergoIdUser) {
    const organization = await this.resolveEmployeeOrganization(employee);
    await this.attachUserToOrganization(user.id, organization.id);

    const organizationName = organization.name;

    const personnelNumber = resolvePersonnelNumber(employee);
    if (!personnelNumber) {
      this.logger.warn(
        `Tabel raqami topilmadi, mirror o'tkazib yuborildi: ${employee.login}`,
      );
      return;
    }

    let existing = await this.findNesMirrorForUpsert(
      user,
      employee,
      personnelNumber,
      organizationName,
    );

    const payload = {
      personnelNumber,
      userId: user.id,
      organizationId: organization.id,
      organizationName,
      division: employee.division ?? '',
      post: employee.post ?? '',
      fullName: `${employee.lastName ?? ''} ${employee.firstName ?? ''}`.trim(),
      lastName: employee.lastName ?? '',
      firstName: employee.firstName ?? '',
      middleName: '',
      modifiedAt: null,
      hiredAt: null,
      login: employee.login,
      initialPassword: employee.initialPassword ?? existing?.initialPassword ?? null,
      rawPayload: employee as unknown as Record<string, unknown>,
      lastSyncedAt: new Date(),
    };

    if (!existing) {
      try {
        await this.employeeRepo.save(this.employeeRepo.create(payload));
        await this.syncUserInitialPassword(user.id, employee.initialPassword);
        return;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (
          !message.includes('duplicate key') &&
          !message.includes('UQ_nes_employee_number_org') &&
          !message.includes('nes_employees_personnel_number_key')
        ) {
          throw error;
        }
        existing =
          (await this.employeeRepo.findOne({ where: { userId: user.id } })) ??
          (await this.employeeRepo.findOne({
            where: { personnelNumber, organizationName },
          })) ??
          (await this.employeeRepo.findOne({ where: { personnelNumber } }));
        if (!existing) throw error;
      }
    }

    Object.assign(existing, payload);
    await this.employeeRepo.save(existing);
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

  private async removeMissingEnergoEmployeeMirrors() {
    const missing = await this.userRepo.find({
      where: { role: Role.USER, energoId: IsNull() },
      select: ['id'],
    });
    const ids = missing.map((user) => user.id);
    if (ids.length === 0) return;
    await this.employeeRepo
      .createQueryBuilder()
      .delete()
      .from('nes_employees')
      .where('user_id IN (:...ids)', { ids })
      .execute();
  }

  async listEmployees(filters?: {
    search?: string;
    organizationName?: string;
    division?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;
    const qb = this.employeeRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.organization', 'organization')
      .orderBy('e.updatedAt', 'DESC');

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

  async getFilterOptions() {
    const orgs = await this.employeeRepo
      .createQueryBuilder('e')
      .select('DISTINCT e.organizationName', 'organizationName')
      .where(
        'e.organizationName IS NOT NULL AND e.organizationName != :empty',
        { empty: '' },
      )
      .orderBy('e.organizationName', 'ASC')
      .getRawMany<{ organizationName: string }>();

    const divs = await this.employeeRepo
      .createQueryBuilder('e')
      .select('DISTINCT e.division', 'division')
      .where('e.division IS NOT NULL AND e.division != :empty', { empty: '' })
      .orderBy('e.division', 'ASC')
      .getRawMany<{ division: string }>();

    return {
      organizations: orgs.map((r) => r.organizationName),
      divisions: divs.map((r) => r.division),
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
    for (const branch of branches) {
      await this.upsertOrganizationMirror({
        energoBranchId: String(branch.id),
        name: String(branch.name ?? '').trim() || 'Unknown',
        externalId: branch.externalId ? String(branch.externalId).trim() : null,
        code: branch.code ? String(branch.code).trim() : null,
      });
    }
    this.logger.log(
      `Energo ID filiallar mirror: ${branches.length} ta organization`,
    );
  }

  private async resolveEmployeeOrganization(employee: EnergoIdUser) {
    const name = employee.organization?.name?.trim() || 'Unknown';
    const externalId = employee.organization?.externalId?.trim() || null;
    return this.upsertOrganizationMirror({ name, externalId });
  }

  private async upsertOrganizationMirror(input: {
    energoBranchId?: string | null;
    name: string;
    externalId?: string | null;
    code?: string | null;
  }) {
    const name = input.name.trim() || 'Unknown';
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

    if (!org) {
      return this.orgRepo.save(
        this.orgRepo.create({
          name,
          energoBranchId: input.energoBranchId ?? null,
          energoExternalId: input.externalId ?? null,
          branchCode: input.code ?? null,
        }),
      );
    }

    await this.releaseOrganizationName(name, org.id);

    await this.orgRepo.update(org.id, {
      name,
      energoBranchId: input.energoBranchId ?? org.energoBranchId,
      energoExternalId: input.externalId ?? org.energoExternalId,
      branchCode: input.code ?? org.branchCode,
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
}
