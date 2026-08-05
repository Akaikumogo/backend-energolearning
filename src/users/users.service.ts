import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Brackets, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { UpdateModeratorDto } from './dto/update-moderator.dto';
import { PromoteModeratorDto } from './dto/promote-moderator.dto';
import { PromoteSuperAdminDto } from './dto/promote-superadmin.dto';
import { ModeratorPermissionsService } from '../moderator-permissions/moderator-permissions.service';
import {
  splitSearchTokens,
  variantsForSearchToken,
} from '../common/utils/latinize-search.util';

export type EnergoIdentityUser = {
  energoUserId: string;
  login: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  organization: {
    externalId: string | null;
    name: string;
  } | null;
  mustChangePassword: boolean;
};

@Injectable()
export class UsersService {
  private nesEmployeesSearchReady: boolean | null = null;

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly moderatorPermissionsService: ModeratorPermissionsService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { email },
      relations: ['organizations', 'organizations.organization'],
    });
  }

  async findByEnergoId(energoId: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { energoId },
      relations: ['organizations', 'organizations.organization'],
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { id },
      relations: ['organizations', 'organizations.organization'],
    });
  }

  async findAll(filters?: {
    role?: Role;
    search?: string;
    page?: number;
    limit?: number;
    organizationIds?: string[];
    organizationFilterMode?: 'include' | 'exclude';
    requireEnergoId?: boolean;
  }): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.organizations', 'uo')
      .leftJoinAndSelect('uo.organization', 'org')
      .orderBy('u.createdAt', 'DESC');

    if (filters?.role) {
      qb.andWhere('u.role = :role', { role: filters.role });
      if (filters.role === Role.USER) {
        qb.andWhere('u.energo_id IS NOT NULL');
      }
    }

    // Energo ID bilan bog'lanmagan moderatorlar (eski local hisoblar) faqat
    // Moderator migratsiyasi sahifasida ko'rinadi — boshqa ro'yxatlardan yashiriladi.
    if (filters?.requireEnergoId) {
      qb.andWhere('u.energo_id IS NOT NULL');
    }

    if (filters?.organizationIds) {
      if (filters.organizationIds.length === 0) {
        return { data: [], total: 0, page, limit };
      }
      if (filters.organizationFilterMode === 'exclude') {
        qb.setParameter('organizationIds', filters.organizationIds);
        qb.andWhere((subQb) => {
          const subQuery = subQb
            .subQuery()
            .select('1')
            .from(UserOrganization, 'filter_uo')
            .where('"filter_uo"."userId" = u.id')
            .andWhere('"filter_uo"."organizationId" IN (:...organizationIds)')
            .getQuery();
          return `NOT EXISTS ${subQuery}`;
        });
      } else {
        qb.andWhere('org.id IN (:...organizationIds)', {
          organizationIds: filters.organizationIds,
        });
      }
    }
    if (filters?.search) {
      const rawTokens = splitSearchTokens(filters.search);
      const nesSearch = await this.canSearchNesEmployees();
      rawTokens.forEach((rawToken, i) => {
        const variants = variantsForSearchToken(rawToken);
        qb.andWhere(
          new Brackets((outer) => {
            variants.forEach((token, j) => {
              const key = `searchTok${i}_${j}`;
              const nesClause = nesSearch
                ? `
                  OR EXISTS (
                    SELECT 1 FROM "nes_employees" nes
                    WHERE nes.user_id = u.id
                    AND (
                      LOWER(nes.login) LIKE :${key}
                      OR LOWER(nes.personnel_number) LIKE :${key}
                      OR LOWER(nes.full_name) LIKE :${key}
                    )
                  )`
                : '';
              outer.orWhere(
                `(
                  LOWER(u.first_name) LIKE :${key}
                  OR LOWER(u.last_name) LIKE :${key}
                  OR LOWER(u.email) LIKE :${key}
                  OR LOWER(CONCAT(u.last_name, ' ', u.first_name)) LIKE :${key}
                  OR LOWER(CONCAT(u.first_name, ' ', u.last_name)) LIKE :${key}
                  OR LOWER(org.name) LIKE :${key}${nesClause}
                )`,
                { [key]: `%${token}%` },
              );
            });
          }),
        );
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  private async canSearchNesEmployees(): Promise<boolean> {
    if (this.nesEmployeesSearchReady !== null) {
      return this.nesEmployeesSearchReady;
    }
    try {
      const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'nes_employees'
        ) AS "exists"`,
      );
      this.nesEmployeesSearchReady = Boolean(rows[0]?.exists);
    } catch {
      this.nesEmployeesSearchReady = false;
    }
    return this.nesEmployeesSearchReady;
  }

  async syncFromEnergoIdentity(data: EnergoIdentityUser): Promise<User> {
    const raw = data as EnergoIdentityUser & { id?: string };
    const energoUserId = (raw.energoUserId ?? raw.id ?? '').trim();
    const login = (raw.login ?? raw.email ?? '').trim();

    if (!login || !energoUserId) {
      throw new BadRequestException('Energo ID user login yoki id yo`q');
    }

    const byEnergo = await this.findByEnergoId(energoUserId);
    const byEmail = await this.findByEmail(login);

    let user = byEnergo ?? byEmail ?? null;

    if (byEnergo && byEmail && byEnergo.id !== byEmail.id) {
      await this.releaseStaleIdentityHolder(byEmail, energoUserId);
      user = byEnergo;
    }

    const resolvedEmail = await this.resolveSyncEmail(
      login,
      energoUserId,
      user?.id ?? null,
    );

    await this.releaseEnergoIdFromOthers(energoUserId, user?.id ?? null);

    const role = this.resolveSyncRole(user, raw.role);

    if (!user) {
      user = await this.usersRepo.save(
        this.usersRepo.create({
          email: resolvedEmail,
          energoId: energoUserId,
          passwordHash: null,
          firstName: data.firstName,
          lastName: data.lastName,
          role,
          mustChangePassword: data.mustChangePassword,
        }),
      );
    } else {
      const patch: Partial<User> = {
        email: resolvedEmail,
        energoId: energoUserId,
        firstName: data.firstName,
        lastName: data.lastName,
        mustChangePassword: data.mustChangePassword,
      };
      if (!this.isProtectedRole(user.role)) {
        patch.role = role;
      }
      await this.usersRepo.update(user.id, patch);
    }

    if (data.organization?.name) {
      const organization = await this.ensureOrganization(
        data.organization.name,
        data.organization.externalId,
      );
      await this.attachUserToOrganization(user.id, organization.id);
    }

    // Email-login (loginida @) — SUPERADMIN dan tashqari kirish yopiq.
    const fresh = (await this.findByEnergoId(energoUserId)) as User;
    if (
      fresh &&
      fresh.role !== Role.SUPERADMIN &&
      fresh.email.includes('@') &&
      !fresh.loginBlocked
    ) {
      await this.usersRepo.update(fresh.id, {
        loginBlocked: true,
        passwordHash: null,
        initialPassword: null,
      });
      return (await this.findByEnergoId(energoUserId)) as User;
    }

    return fresh;
  }

  /** Boshqa user shu email/energo_id ni ushlab turgan bo'lsa, sync oldin bo'shatiladi. */
  private async resolveSyncEmail(
    login: string,
    energoUserId: string,
    keepUserId: string | null,
  ): Promise<string> {
    const holder = await this.findByEmail(login);
    if (!holder || (keepUserId && holder.id === keepUserId)) {
      return login;
    }

    if (holder.role !== Role.USER) {
      return `energo.${energoUserId.slice(0, 8)}@workers.elektrolearn.local`;
    }

    await this.releaseStaleIdentityHolder(holder, energoUserId);
    return login;
  }

  private async releaseEnergoIdFromOthers(
    energoUserId: string,
    keepUserId: string | null,
  ) {
    const holder = await this.usersRepo.findOne({ where: { energoId: energoUserId } });
    if (!holder || (keepUserId && holder.id === keepUserId)) return;
    await this.usersRepo.update(holder.id, { energoId: null });
  }

  private async releaseStaleIdentityHolder(stale: User, energoUserId: string) {
    if (stale.role !== Role.USER) return;

    const patch: Partial<User> = {
      email: this.legacyEmailForUser(stale.id),
      energoId: stale.energoId === energoUserId ? null : stale.energoId,
    };

    await this.usersRepo.update(stale.id, patch);
  }

  private legacyEmailForUser(userId: string) {
    return `legacy+${userId.replace(/-/g, '').slice(0, 12)}@elektrolearn.local`;
  }

  async hideStaleEnergoUsers(activeEnergoIds: string[]): Promise<number> {
    // Himoya: bo'sh ro'yxat bilan chaqirilsa BARCHA foydalanuvchilarning
    // energo_id si o'chib ketadi va ular admin ro'yxatlaridan yo'qoladi.
    if (activeEnergoIds.length === 0) {
      return 0;
    }

    const uniqueIds = [
      ...new Set(activeEnergoIds.map((id) => id.trim()).filter(Boolean)),
    ];

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

      const rows: Array<{ cnt: string }> = await manager.query(`
        WITH updated AS (
          UPDATE users u
          SET energo_id = NULL, updated_at = NOW()
          WHERE u.role = $1
            AND u.energo_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM sync_active_energo_ids a WHERE a.id = u.energo_id
            )
          RETURNING u.id
        )
        SELECT COUNT(*)::int AS cnt FROM updated
      `, [Role.USER]);

      return Number(rows[0]?.cnt ?? 0);
    });
  }

  async syncEmployeesFromEnergoIdentity(
    employees: EnergoIdentityUser[],
  ): Promise<{ total: number; upserted: number; hidden: number }> {
    const activeEnergoIds: string[] = [];
    let upserted = 0;

    for (const employee of employees) {
      if (employee.role !== Role.USER) continue;
      await this.syncFromEnergoIdentity(employee);
      activeEnergoIds.push(employee.energoUserId);
      upserted += 1;
    }

    const hidden = await this.hideStaleEnergoUsers(activeEnergoIds);

    return {
      total: employees.length,
      upserted,
      hidden,
    };
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    organizationId?: string;
  }): Promise<User> {
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: Role.USER,
      }),
    );

    if (data.organizationId) {
      const org = await this.orgRepo.findOne({
        where: { id: data.organizationId },
      });
      if (org) {
        await this.userOrgRepo.save(
          this.userOrgRepo.create({ user, organization: org }),
        );
      }
    }

    return user;
  }

  async promoteToModerator(dto: PromoteModeratorDto): Promise<User> {
    const user = await this.findById(dto.userId);
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (user.role === Role.MODERATOR) {
      throw new BadRequestException('Bu xodim allaqachon moderator');
    }
    if (user.role === Role.SUPERADMIN) {
      throw new BadRequestException('SuperAdmin moderator qilib belgilanmaydi');
    }
    if (!user.energoId) {
      throw new BadRequestException(
        'Faqat Energo ID orqali kelgan xodim moderator qilinadi',
      );
    }

    await this.usersRepo.update(user.id, {
      role: Role.MODERATOR,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });

    if (dto.organizationId) {
      const org = await this.orgRepo.findOne({
        where: { id: dto.organizationId },
      });
      if (org) {
        await this.attachUserToOrganization(user.id, org.id);
      }
    }

    await this.moderatorPermissionsService.getOrCreate(user.id);
    return this.findById(user.id) as Promise<User>;
  }

  async demoteFromModerator(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Moderator topilmadi');
    if (user.role !== Role.MODERATOR) {
      throw new BadRequestException('Faqat moderator rolini olib tashlash mumkin');
    }

    await this.usersRepo.update(user.id, {
      role: Role.USER,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });

    return this.findById(user.id) as Promise<User>;
  }

  async promoteToDirector(dto: PromoteModeratorDto): Promise<User> {
    const user = await this.findById(dto.userId);
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (user.role === Role.DIRECTOR) {
      throw new BadRequestException('Bu xodim allaqachon direktor');
    }
    if (user.role === Role.SUPERADMIN) {
      throw new BadRequestException('SuperAdmin direktor qilib belgilanmaydi');
    }
    if (!user.energoId) {
      throw new BadRequestException(
        'Faqat Energo ID orqali kelgan xodim direktor qilinadi',
      );
    }
    if (!dto.organizationId) {
      throw new BadRequestException('Direktor uchun filial (organizationId) majburiy');
    }

    const org = await this.orgRepo.findOne({
      where: { id: dto.organizationId },
    });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');

    await this.usersRepo.update(user.id, {
      role: Role.DIRECTOR,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });
    await this.attachUserToOrganization(user.id, org.id);
    return this.findById(user.id) as Promise<User>;
  }

  async demoteFromDirector(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Direktor topilmadi');
    if (user.role !== Role.DIRECTOR) {
      throw new BadRequestException('Faqat direktor rolini olib tashlash mumkin');
    }

    await this.usersRepo.update(user.id, {
      role: Role.USER,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });

    return this.findById(user.id) as Promise<User>;
  }

  async promoteToSuperAdmin(dto: PromoteSuperAdminDto): Promise<User> {
    const user = await this.findById(dto.userId);
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (user.role === Role.SUPERADMIN) {
      throw new BadRequestException('Bu xodim allaqachon SuperAdmin');
    }
    if (!user.energoId) {
      throw new BadRequestException(
        'Faqat Energo ID orqali kelgan xodim SuperAdmin qilinadi',
      );
    }

    await this.usersRepo.update(user.id, {
      role: Role.SUPERADMIN,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });

    return this.findById(user.id) as Promise<User>;
  }

  async demoteFromSuperAdmin(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.role !== Role.SUPERADMIN) {
      throw new BadRequestException('Faqat SuperAdmin rolini olib tashlash mumkin');
    }
    if (!user.energoId) {
      throw new BadRequestException(
        'Local bootstrap SuperAdmin demote qilinmaydi',
      );
    }

    const superAdminCount = await this.usersRepo.count({
      where: { role: Role.SUPERADMIN },
    });
    if (superAdminCount <= 1) {
      throw new BadRequestException(
        'Oxirgi SuperAdmin demote qilinmaydi',
      );
    }

    await this.usersRepo.update(user.id, {
      role: Role.USER,
      passwordHash: null,
      initialPassword: null,
      mustChangePassword: false,
    });

    return this.findById(user.id) as Promise<User>;
  }

  async createModerator(dto: CreateModeratorDto): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Bu email allaqachon mavjud');

    const passwordWasProvided = !!dto.password?.trim();
    const plainPassword = passwordWasProvided
      ? (dto.password as string)
      : this.generatePassword();

    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: Role.MODERATOR,
        initialPassword: plainPassword,
        // Avtomat generatsiya qilingan parol — birinchi loginda majburiy o'zgartirish
        mustChangePassword: !passwordWasProvided,
      }),
    );

    if (dto.organizationId) {
      const org = await this.orgRepo.findOne({
        where: { id: dto.organizationId },
      });
      if (org) {
        await this.userOrgRepo.save(
          this.userOrgRepo.create({ user, organization: org }),
        );
      }
    }

    return this.findById(user.id) as Promise<User>;
  }

  async updateModerator(id: string, dto: UpdateModeratorDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Moderator topilmadi');
    if (user.role !== Role.MODERATOR) {
      throw new BadRequestException('Faqat moderator yangilanadi');
    }

    if (dto.email && dto.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const taken = await this.usersRepo.findOne({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (taken && taken.id !== id) {
        throw new BadRequestException('Bu email allaqachon mavjud');
      }
      user.email = dto.email.trim();
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    if (dto.password?.trim()) {
      const plain = dto.password.trim();
      user.passwordHash = await bcrypt.hash(plain, 10);
      user.initialPassword = plain;
      user.mustChangePassword = false;
    }

    await this.usersRepo.save(user);

    if (dto.organizationId) {
      const org = await this.orgRepo.findOne({
        where: { id: dto.organizationId },
      });
      if (org) {
        await this.attachUserToOrganization(user.id, org.id);
      }
    } else if (dto.organizationId === null) {
      await this.userOrgRepo
        .createQueryBuilder()
        .delete()
        .where('"userId" = :userId', { userId: user.id })
        .execute();
    }

    return this.findById(user.id) as Promise<User>;
  }

  async bulkGenerateModeratorPasswords(userIds: string[]): Promise<{
    updated: number;
    users: Array<{ id: string; password: string }>;
  }> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Moderator tanlanmagan');
    }

    const users = await this.usersRepo.find({
      where: uniqueIds.map((id) => ({ id, role: Role.MODERATOR })),
    });
    if (users.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Tanlangan ro`yxatda moderator bo`lmagan user bor',
      );
    }

    const results: Array<{ id: string; password: string }> = [];
    for (const user of users) {
      const password = this.generatePassword();
      user.passwordHash = await bcrypt.hash(password, 10);
      user.initialPassword = password;
      user.mustChangePassword = true;
      results.push({ id: user.id, password });
    }

    await this.usersRepo.save(users);
    return { updated: users.length, users: results };
  }

  async removeUser(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (user.role === Role.SUPERADMIN) {
      throw new BadRequestException('SuperAdmin o`chirib bo`lmaydi');
    }
    await this.usersRepo.remove(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const updates: Partial<User> = {};
    if (dto.firstName !== undefined) updates.firstName = dto.firstName;
    if (dto.lastName !== undefined) updates.lastName = dto.lastName;

    if (Object.keys(updates).length > 0) {
      await this.usersRepo.update(userId, updates);
    }

    return this.findById(userId) as Promise<User>;
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string,
  ): Promise<void> {
    await this.usersRepo.update(userId, { passwordHash });
  }

  async clearMustChangePassword(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { mustChangePassword: false });
  }

  private isProtectedRole(role: Role): boolean {
    return (
      role === Role.MODERATOR ||
      role === Role.SUPERADMIN ||
      role === Role.DIRECTOR
    );
  }

  private resolveSyncRole(existing: User | null, incomingRole: string): Role {
    if (existing && this.isProtectedRole(existing.role)) {
      return existing.role;
    }
    return this.toLocalRole(incomingRole);
  }

  private toLocalRole(role: string): Role {
    if (Object.values(Role).includes(role as Role)) return role as Role;
    return Role.USER;
  }

  private async ensureOrganization(name: string, externalId?: string | null) {
    const trimmed = name.trim() || 'Unknown';
    const ext = externalId?.trim() || null;

    if (ext) {
      const byExternal = await this.orgRepo.findOne({
        where: { energoExternalId: ext },
      });
      if (byExternal) return byExternal;
    }

    const existing = await this.orgRepo.findOne({ where: { name: trimmed } });
    if (existing) {
      if (ext && !existing.energoExternalId) {
        await this.orgRepo.update(existing.id, { energoExternalId: ext });
      }
      return existing;
    }

    return this.orgRepo.save(
      this.orgRepo.create({
        name: trimmed,
        energoExternalId: ext,
      }),
    );
  }

  private async attachUserToOrganization(
    userId: string,
    organizationId: string,
  ) {
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

  private generatePassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i += 1) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }
}
