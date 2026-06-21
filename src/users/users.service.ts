import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { User } from '../database/entities/user.entity';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateModeratorDto } from './dto/create-moderator.dto';

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
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
  ) {}

  async onModuleInit() {
    const superAdminEmail =
      process.env.SUPERADMIN_EMAIL ?? 'elektroLearn@admin.com';
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD;

    // Productionda env yo'q bo'lsa, default zaif parol bilan boot qilmaymiz.
    if (!superAdminPassword) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'SUPERADMIN_PASSWORD env o`rnatilishi shart (production).',
        );
      }
      // Lokal dev uchun ogohlantirish bilan davom etamiz.
      console.warn(
        '[users] SUPERADMIN_PASSWORD env yo`q — superadmin yaratish o`tkazib yuborildi.',
      );
      return;
    }

    const existing = await this.usersRepo.findOne({
      where: { email: superAdminEmail },
    });
    if (existing) {
      // SUPERADMIN parolini DB'da plain saqlamaymiz — Excel export'da ham
      // bu rol ko'rinmaydi (faqat moderatorlar uchun initialPassword bor).
      if (existing.initialPassword) {
        existing.initialPassword = null;
        await this.usersRepo.save(existing);
      }
      return;
    }

    const orgName = 'Default Organization';
    let org = await this.orgRepo.findOne({ where: { name: orgName } });
    if (!org) {
      org = await this.orgRepo.save(this.orgRepo.create({ name: orgName }));
    }

    const passwordHash = await bcrypt.hash(superAdminPassword, 10);

    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: superAdminEmail,
        passwordHash,
        googleId: null,
        firstName: 'Elektro',
        lastName: 'Admin',
        role: Role.SUPERADMIN,
        // SUPERADMIN uchun plain parol DB'da saqlanmaydi.
        initialPassword: null,
      }),
    );

    await this.userOrgRepo.save(
      this.userOrgRepo.create({ user, organization: org }),
    );
  }

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
      qb.andWhere(
        `(LOWER(u.first_name) LIKE :q OR LOWER(u.last_name) LIKE :q OR LOWER(u.email) LIKE :q)`,
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async syncFromEnergoIdentity(data: EnergoIdentityUser): Promise<User> {
    const login = data.login.trim();
    const role = this.toLocalRole(data.role);
    let user =
      (await this.findByEnergoId(data.energoUserId)) ??
      (await this.findByEmail(login));

    if (!user) {
      user = await this.usersRepo.save(
        this.usersRepo.create({
          email: login,
          energoId: data.energoUserId,
          passwordHash: null,
          firstName: data.firstName,
          lastName: data.lastName,
          role,
          mustChangePassword: data.mustChangePassword,
        }),
      );
    } else {
      await this.usersRepo.update(user.id, {
        email: login,
        energoId: data.energoUserId,
        firstName: data.firstName,
        lastName: data.lastName,
        role,
        mustChangePassword: data.mustChangePassword,
      });
    }

    if (data.organization?.name) {
      const organization = await this.ensureOrganization(
        data.organization.name,
      );
      await this.attachUserToOrganization(user.id, organization.id);
    }

    return this.findByEnergoId(data.energoUserId) as Promise<User>;
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

    const qb = this.usersRepo
      .createQueryBuilder()
      .update(User)
      .set({ energoId: null })
      .where('role = :role', { role: Role.USER })
      .andWhere('energo_id IS NOT NULL');

    if (activeEnergoIds.length > 0) {
      qb.andWhere('energo_id NOT IN (:...activeEnergoIds)', {
        activeEnergoIds,
      });
    }

    const hiddenResult = await qb.execute();

    return {
      total: employees.length,
      upserted,
      hidden: hiddenResult.affected ?? 0,
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

  private toLocalRole(role: string): Role {
    if (Object.values(Role).includes(role as Role)) return role as Role;
    return Role.USER;
  }

  private async ensureOrganization(name: string) {
    const existing = await this.orgRepo.findOne({ where: { name } });
    if (existing) return existing;
    return this.orgRepo.save(this.orgRepo.create({ name }));
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
