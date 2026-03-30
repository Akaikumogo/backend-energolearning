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
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD ?? '!Qw3rty';

    const existing = await this.usersRepo.findOne({
      where: { email: superAdminEmail },
    });
    if (existing) return;

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
  }): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const qb = this.usersRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.organizations', 'uo')
      .leftJoinAndSelect('uo.organization', 'org')
      .orderBy('u.createdAt', 'DESC');

    qb.distinct(true);

    if (filters?.role) {
      qb.andWhere('u.role = :role', { role: filters.role });
    }

    if (filters?.organizationIds) {
      if (filters.organizationIds.length === 0) {
        return { data: [], total: 0, page, limit };
      }
      qb.andWhere('org.id IN (:...organizationIds)', {
        organizationIds: filters.organizationIds,
      });
    }
    if (filters?.search) {
      qb.andWhere(
        `(LOWER(u.first_name) LIKE :q OR LOWER(u.last_name) LIKE :q OR LOWER(u.email) LIKE :q)`,
        { q: `%${filters.search.toLowerCase()}%` },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, total, page, limit };
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
      const org = await this.orgRepo.findOne({ where: { id: data.organizationId } });
      if (org) {
        await this.userOrgRepo.save(this.userOrgRepo.create({ user, organization: org }));
      }
    }

    return user;
  }

  async createModerator(dto: CreateModeratorDto): Promise<User> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new BadRequestException('Bu email allaqachon mavjud');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersRepo.save(
      this.usersRepo.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: Role.MODERATOR,
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
}
