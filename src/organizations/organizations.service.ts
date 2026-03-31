import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../database/entities/organization.entity';
import { UserOrganization } from '../database/entities/user-organization.entity';
import { User } from '../database/entities/user.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserOrganization)
    private readonly userOrgRepo: Repository<UserOrganization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(
    filters?: { search?: string },
    organizationIds?: string[],
  ): Promise<Organization[]> {
    const qb = this.orgRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.users', 'uo')
      .leftJoinAndSelect('uo.user', 'u')
      .orderBy('o.createdAt', 'DESC');

    if (organizationIds) {
      if (organizationIds.length === 0) return [];
      qb.andWhere('o.id IN (:...organizationIds)', { organizationIds });
    }

    if (filters?.search) {
      qb.andWhere('LOWER(o.name) LIKE :q', {
        q: `%${filters.search.toLowerCase()}%`,
      });
    }

    return qb.getMany();
  }

  async listPublicNames(): Promise<{ id: string; name: string }[]> {
    const rows = await this.orgRepo.find({
      select: ['id', 'name'],
      order: { name: 'ASC' },
    });
    return rows.map((o) => ({ id: o.id, name: o.name }));
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.orgRepo.findOne({
      where: { id },
      relations: ['users', 'users.user'],
    });
    if (!org) throw new NotFoundException('Tashkilot topilmadi');
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const exists = await this.orgRepo.findOne({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('Bu nomli tashkilot mavjud');
    const org = this.orgRepo.create({ name: dto.name });
    return this.orgRepo.save(org);
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    if (dto.name) org.name = dto.name;
    return this.orgRepo.save(org);
  }

  async remove(id: string): Promise<void> {
    const org = await this.findById(id);
    await this.orgRepo.remove(org);
  }

  async assignUser(orgId: string, userId: string): Promise<UserOrganization> {
    await this.findById(orgId);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    const existing = await this.userOrgRepo.findOne({
      where: {
        user: { id: userId },
        organization: { id: orgId },
      },
    });
    if (existing) throw new BadRequestException('Foydalanuvchi allaqachon biriktirilgan');

    const uo = this.userOrgRepo.create({
      user: { id: userId } as User,
      organization: { id: orgId } as Organization,
    });
    return this.userOrgRepo.save(uo);
  }

  async removeUser(orgId: string, userId: string): Promise<void> {
    const uo = await this.userOrgRepo.findOne({
      where: {
        user: { id: userId },
        organization: { id: orgId },
      },
    });
    if (!uo) throw new NotFoundException('Bog`lanish topilmadi');
    await this.userOrgRepo.remove(uo);
  }
}
