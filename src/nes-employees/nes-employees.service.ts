import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { NesEmployeeHistory } from '../database/entities/nes-employee-history.entity';
import { NesEmployeePositionHistory } from '../database/entities/nes-employee-position-history.entity';
import { NesEmployee } from '../database/entities/nes-employee.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { NesSyncGateway } from './nes-sync.gateway';

type NesEmployeePayload = {
  personnel_number?: string;
  organization?: string;
  division?: string;
  post?: string;
  full_name?: string;
  last_name?: string;
  first_name?: string;
  middle_name?: string;
  modified_date?: string;
  hired_date?: string;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
};

type NormalizedEmployee = {
  personnelNumber: string;
  organizationName: string;
  division: string;
  post: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  modifiedAt: Date | null;
  hiredAt: Date | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  rawPayload: Record<string, unknown>;
};

@Injectable()
export class NesEmployeesService {
  private readonly logger = new Logger(NesEmployeesService.name);

  private syncState: {
    running: boolean;
    current: number;
    total: number;
    startedAt: Date | null;
  } = { running: false, current: 0, total: 0, startedAt: null };

  getSyncStatus() {
    return { ...this.syncState };
  }

  constructor(
    @InjectRepository(NesEmployee)
    private readonly employeeRepo: Repository<NesEmployee>,
    @InjectRepository(NesEmployeeHistory)
    private readonly historyRepo: Repository<NesEmployeeHistory>,
    @InjectRepository(NesEmployeePositionHistory)
    private readonly positionHistoryRepo: Repository<NesEmployeePositionHistory>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    private readonly nesSyncGateway: NesSyncGateway,
  ) {}

  @Cron('59 23 * * *', { timeZone: 'Asia/Tashkent' })
  async syncBySchedule() {
    try {
      await this.syncFromNes();
    } catch (error) {
      this.logger.error('NES employee scheduled sync failed', error as Error);
    }
  }

  async syncFromNes(date = process.env.NES_EMPLOYEES_SYNC_DATE ?? new Date().toISOString().slice(0, 10)) {
    if (this.syncState.running) {
      throw new BadRequestException('Sync allaqachon ishlamoqda');
    }

    const rows = (await this.fetchEmployees(date))
      .map((row) => this.normalize(row))
      .sort((a, b) => {
        const keyCompare = this.identityKey(a).localeCompare(this.identityKey(b));
        if (keyCompare !== 0) return keyCompare;
        return this.eventTime(a) - this.eventTime(b);
      });

    this.syncState = { running: true, current: 0, total: rows.length, startedAt: new Date() };
    this.nesSyncGateway.emitProgress(0, rows.length, 0);

    let created = 0;
    let updated = 0;
    let unchanged = 0;

    try {
      for (const row of rows) {
        const result = await this.upsertEmployee(row);
        this.syncState.current += 1;
        if (result === 'created') created += 1;
        else if (result === 'updated') updated += 1;
        else unchanged += 1;

        // Har 50 ta xodimda bir emit
        if (this.syncState.current % 50 === 0 || this.syncState.current === rows.length) {
          this.nesSyncGateway.emitProgress(this.syncState.current, rows.length, created);
        }
      }
    } finally {
      this.syncState.running = false;
    }

    const result = {
      success: true,
      date,
      total: rows.length,
      created,
      updated,
      unchanged,
    };
    this.nesSyncGateway.emitDone(result);
    return result;
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
      .where('e.organizationName IS NOT NULL AND e.organizationName != :empty', { empty: '' })
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

  async deleteAll() {
    if (this.syncState.running) {
      throw new BadRequestException('Sync ishlamoqda, avval tugashini kuting');
    }

    // Barcha NES xodimlarning userId larini yig'amiz
    const employees = await this.employeeRepo.find({ select: ['id', 'userId'] });
    const userIds = employees.map((e) => e.userId);

    // nes_employee_position_history va nes_employee_history CASCADE bilan o'chadi
    // avval nes_employees o'chiramiz
    await this.employeeRepo.createQueryBuilder()
      .delete()
      .from('nes_employees')
      .execute();

    // Bog'liq userlarni o'chiramiz (user_organization ham CASCADE o'chadi)
    if (userIds.length > 0) {
      await this.userRepo.createQueryBuilder()
        .delete()
        .from('users')
        .whereInIds(userIds)
        .execute();
    }

    return { success: true, deleted: employees.length };
  }

  async listHistory(employeeId: string) {
    return this.historyRepo.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async listPositionHistory(employeeId: string) {
    const items = await this.positionHistoryRepo.find({
      where: { employeeId },
      order: { effectiveAt: 'ASC', createdAt: 'ASC' },
    });
    return items.map((item, idx) => ({
      ...item,
      isCurrent: idx === items.length - 1,
    }));
  }

  private async fetchEmployees(date: string): Promise<NesEmployeePayload[]> {
    const url =
      process.env.NES_EMPLOYEES_URL ??
      'http://192.0.3.186/NES/hs/employees/get';
    const username = process.env.NES_EMPLOYEES_USERNAME ?? 'HTTPClient';
    const password =
      process.env.NES_EMPLOYEES_PASSWORD ?? 'ZF5d0GLem3FuBLn';
    const basic = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ date }),
    });

    if (!response.ok) {
      throw new BadRequestException(
        `NES employee API error: ${response.status} ${response.statusText}`,
      );
    }

    const payload = await response.json();
    if (Array.isArray(payload)) return payload as NesEmployeePayload[];
    if (Array.isArray(payload?.data)) return payload.data as NesEmployeePayload[];
    if (Array.isArray(payload?.employees)) {
      return payload.employees as NesEmployeePayload[];
    }
    throw new BadRequestException('NES employee API response array emas');
  }

  private normalize(row: NesEmployeePayload): NormalizedEmployee {
    const fullName = this.clean(row.full_name);
    const split = fullName.split(/\s+/).filter(Boolean);
    const firstName = this.clean(row.first_name) || split[1] || split[0] || '';
    const lastName = this.clean(row.last_name) || split[0] || '';
    const middleName =
      this.clean(row.middle_name) || split.slice(2).join(' ') || '';

    return {
      personnelNumber: this.clean(row.personnel_number),
      organizationName: this.clean(row.organization),
      division: this.clean(row.division),
      post: this.clean(row.post),
      fullName,
      lastName,
      firstName,
      middleName,
      modifiedAt: this.parseNesDate(row.modified_date),
      hiredAt: this.parseNesDate(row.hired_date),
      sourceCreatedAt: this.parseNesDate(row.created_at ?? row.createdAt),
      sourceUpdatedAt: this.parseNesDate(row.updated_at ?? row.updatedAt),
      rawPayload: row as Record<string, unknown>,
    };
  }

  private async upsertEmployee(data: NormalizedEmployee) {
    if (!data.personnelNumber || !data.organizationName) {
      throw new BadRequestException('personnel_number va organization majburiy');
    }

    const organization = await this.ensureOrganization(data.organizationName);
    // Unique kalit: personnelNumber + organizationName
    // Bir tashkilotda bir raqam faqat bitta odamga tegishli
    const existing = await this.employeeRepo.findOne({
      where: {
        personnelNumber: data.personnelNumber,
        organizationName: data.organizationName,
      },
      relations: ['user'],
    });

    if (!existing) {
      const password = this.generatePassword();
      const login = await this.generateUniqueLogin(data);
      const user = await this.userRepo.save(
        this.userRepo.create({
          email: login,
          passwordHash: await bcrypt.hash(password, 10),
          googleId: null,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.USER,
        }),
      );
      await this.attachUserToOrganization(user.id, organization.id);
      const employee = await this.employeeRepo.save(
        this.employeeRepo.create({
          ...data,
          organizationId: organization.id,
          login,
          initialPassword: password,
          userId: user.id,
          lastSyncedAt: new Date(),
        }),
      );
      await this.upsertPositionHistory(employee, data);
      await this.writeHistory(employee, 'created', {}, data);
      return 'created' as const;
    }

    const expectedLogin = this.buildLogin(data);
    const nextLogin = await this.reserveLogin(expectedLogin, existing.userId);
    const changes = this.diffEmployee(existing, data, organization.id, nextLogin);

    if (Object.keys(changes).length === 0) {
      existing.lastSyncedAt = new Date();
      await this.employeeRepo.save(existing);
      return 'unchanged' as const;
    }

    await this.userRepo.update(existing.userId, {
      email: nextLogin,
      firstName: data.firstName,
      lastName: data.lastName,
    });
    await this.attachUserToOrganization(existing.userId, organization.id);
    Object.assign(existing, {
      ...data,
      organizationId: organization.id,
      login: nextLogin,
      lastSyncedAt: new Date(),
    });
    const saved = await this.employeeRepo.save(existing);
    await this.upsertPositionHistory(saved, data);
    await this.writeHistory(saved, 'updated', changes, data);
    return 'updated' as const;
  }

  private async upsertPositionHistory(
    employee: NesEmployee,
    data: NormalizedEmployee,
  ) {
    const effectiveAt =
      data.sourceUpdatedAt ?? data.modifiedAt ?? data.hiredAt ?? data.sourceCreatedAt;
    const existingQb = this.positionHistoryRepo
      .createQueryBuilder('h')
      .where('h.employee_id = :employeeId', { employeeId: employee.id })
      .andWhere('h.organization_name = :organizationName', {
        organizationName: data.organizationName,
      })
      .andWhere('h.division = :division', { division: data.division })
      .andWhere('h.post = :post', { post: data.post });
    if (effectiveAt) {
      existingQb.andWhere('h.effective_at = :effectiveAt', { effectiveAt });
    } else {
      existingQb.andWhere('h.effective_at IS NULL');
    }
    const existing = await existingQb.getOne();
    if (existing) return;

    await this.positionHistoryRepo.save(
      this.positionHistoryRepo.create({
        employeeId: employee.id,
        personnelNumber: employee.personnelNumber,
        organizationName: data.organizationName,
        division: data.division,
        post: data.post,
        effectiveAt,
        sourceCreatedAt: data.sourceCreatedAt,
        sourceUpdatedAt: data.sourceUpdatedAt,
        rawPayload: data.rawPayload,
      }),
    );
  }

  private async ensureOrganization(name: string) {
    const existing = await this.orgRepo.findOne({ where: { name } });
    if (existing) return existing;
    return this.orgRepo.save(this.orgRepo.create({ name }));
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

  private diffEmployee(
    existing: NesEmployee,
    next: NormalizedEmployee,
    organizationId: string,
    login: string,
  ) {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const fields: Array<keyof NormalizedEmployee> = [
      'personnelNumber',
      'organizationName',
      'division',
      'post',
      'fullName',
      'lastName',
      'firstName',
      'middleName',
      'modifiedAt',
      'hiredAt',
      'sourceCreatedAt',
      'sourceUpdatedAt',
    ];

    for (const field of fields) {
      const oldValue = existing[field as keyof NesEmployee] as unknown;
      const newValue = next[field];
      if (this.toComparable(oldValue) !== this.toComparable(newValue)) {
        changes[field] = { old: oldValue, new: newValue };
      }
    }
    if (existing.organizationId !== organizationId) {
      changes.organizationId = {
        old: existing.organizationId,
        new: organizationId,
      };
    }
    if (existing.login !== login) {
      changes.login = { old: existing.login, new: login };
    }
    return changes;
  }

  private async writeHistory(
    employee: NesEmployee,
    event: 'created' | 'updated',
    changes: Record<string, { old: unknown; new: unknown }>,
    snapshot: NormalizedEmployee,
  ) {
    await this.historyRepo.save(
      this.historyRepo.create({
        employeeId: employee.id,
        personnelNumber: employee.personnelNumber,
        event,
        changes,
        snapshot: {
          ...snapshot,
          modifiedAt: snapshot.modifiedAt?.toISOString() ?? null,
          hiredAt: snapshot.hiredAt?.toISOString() ?? null,
          sourceCreatedAt: snapshot.sourceCreatedAt?.toISOString() ?? null,
          sourceUpdatedAt: snapshot.sourceUpdatedAt?.toISOString() ?? null,
          login: employee.login,
          organizationId: employee.organizationId,
        },
      }),
    );
  }

  private async generateUniqueLogin(data: NormalizedEmployee) {
    return this.reserveLogin(this.buildLogin(data));
  }

  private async reserveLogin(baseLogin: string, currentUserId?: string) {
    let candidate = baseLogin;
    let suffix = 1;
    while (await this.loginExists(candidate, currentUserId)) {
      suffix += 1;
      candidate = `${baseLogin}${suffix}`;
    }
    return candidate;
  }

  private async loginExists(login: string, currentUserId?: string) {
    const user = await this.userRepo.findOne({ where: { email: login } });
    return !!user && user.id !== currentUserId;
  }

  private buildLogin(data: NormalizedEmployee) {
    const name =
      data.firstName || data.fullName.split(/\s+/).filter(Boolean)[0] || 'user';
    const divisionPrefix =
      data.division.split(/\s+(?:МЭТ|MET)\b/i)[0] || data.division;
    return [name, data.personnelNumber, divisionPrefix]
      .map((part) => this.slug(this.cyrillicToLatin(part)))
      .filter(Boolean)
      .join('.');
  }

  private generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i += 1) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }

  private parseNesDate(value?: string) {
    const cleaned = this.clean(value);
    const match = cleaned.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(.+))?$/);
    if (!match) return null;
    const [, day, month, year, time = '0:00:00'] = match;
    const iso = `${year}-${month}-${day}T${time.padStart(8, '0')}+05:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private identityKey(data: NormalizedEmployee) {
    return [
      data.personnelNumber,
      data.fullName.toLowerCase(),
      data.organizationName.toLowerCase(),
    ].join('|');
  }

  private eventTime(data: NormalizedEmployee) {
    return (
      data.sourceCreatedAt ??
      data.hiredAt ??
      data.sourceUpdatedAt ??
      data.modifiedAt ??
      new Date(0)
    ).getTime();
  }

  private clean(value?: string) {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  private slug(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private toComparable(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    return value ?? null;
  }

  private cyrillicToLatin(text: string) {
    const map: Record<string, string> = {
      А: 'A', а: 'a', Б: 'B', б: 'b', В: 'V', в: 'v', Г: 'G', г: 'g',
      Д: 'D', д: 'd', Е: 'E', е: 'e', Ё: 'Yo', ё: 'yo', Ж: 'J', ж: 'j',
      З: 'Z', з: 'z', И: 'I', и: 'i', Й: 'Y', й: 'y', К: 'K', к: 'k',
      Л: 'L', л: 'l', М: 'M', м: 'm', Н: 'N', н: 'n', О: 'O', о: 'o',
      П: 'P', п: 'p', Р: 'R', р: 'r', С: 'S', с: 's', Т: 'T', т: 't',
      У: 'U', у: 'u', Ф: 'F', ф: 'f', Х: 'X', х: 'x', Ц: 'S', ц: 's',
      Ч: 'Ch', ч: 'ch', Ш: 'Sh', ш: 'sh', Ъ: '', ъ: '', Ь: '', ь: '',
      Э: 'E', э: 'e', Ю: 'Yu', ю: 'yu', Я: 'Ya', я: 'ya', Ў: 'O',
      ў: 'o', Қ: 'Q', қ: 'q', Ғ: 'G', ғ: 'g', Ҳ: 'H', ҳ: 'h',
    };
    return text.replace(/[А-Яа-яЁёЎўҚқҒғҲҳЪъЬь]/g, (char) => map[char] ?? char);
  }
}
