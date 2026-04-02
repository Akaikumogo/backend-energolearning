import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  async isDefaultModerator(organizationIds: string[]): Promise<boolean> {
    if (organizationIds.length === 0) return false;
    const count = await this.orgRepo.count({
      where: { id: In(organizationIds), isDefault: true },
    });
    return count > 0;
  }

  /**
   * Returns orgIds + all descendants (recursive) based on parentOrganizationId.
   * If input is empty returns [].
   */
  async expandOrgScope(organizationIds: string[]): Promise<string[]> {
    if (organizationIds.length === 0) return [];

    // Using recursive CTE for Postgres
    const rows = await this.orgRepo.query(
      `
      WITH RECURSIVE org_tree AS (
        SELECT id
        FROM organizations
        WHERE id = ANY($1::uuid[])
        UNION
        SELECT o.id
        FROM organizations o
        INNER JOIN org_tree t ON o.parent_organization_id = t.id
      )
      SELECT id FROM org_tree;
      `,
      [organizationIds],
    );

    const ids = (rows ?? [])
      .map((r: any) => r.id)
      .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
    return Array.from(new Set(ids));
  }

  /**
   * For moderators:
   * - if assigned to default org => undefined (no filtering)
   * - else => orgIds expanded with descendants
   */
  async resolveModeratorScope(organizationIds: string[] | undefined) {
    if (!organizationIds) return undefined;
    if (organizationIds.length === 0) return [];
    const isDefault = await this.isDefaultModerator(organizationIds);
    if (isDefault) return undefined;
    return this.expandOrgScope(organizationIds);
  }

  async findAll(
    filters?: { search?: string },
    organizationIds?: string[],
  ): Promise<Organization[]> {
    const scopedOrgIds = await this.resolveModeratorScope(organizationIds);
    const qb = this.orgRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.users', 'uo')
      .leftJoinAndSelect('uo.user', 'u')
      .orderBy('o.createdAt', 'DESC');

    if (scopedOrgIds) {
      if (scopedOrgIds.length === 0) return [];
      qb.andWhere('o.id IN (:...organizationIds)', {
        organizationIds: scopedOrgIds,
      });
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
    const parentId = dto.parentOrganizationId ?? null;
    if (parentId) {
      const parent = await this.orgRepo.findOne({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('Parent tashkilot topilmadi');
    }

    if (dto.isDefault === true) {
      // Ensure only one default org
      await this.orgRepo.update({ isDefault: true }, { isDefault: false });
    }

    const org = this.orgRepo.create({
      name: dto.name,
      parentOrganizationId: parentId,
      isDefault: dto.isDefault === true,
    });
    return this.orgRepo.save(org);
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    if (dto.name) org.name = dto.name;
    if (dto.parentOrganizationId !== undefined) {
      const parentId = dto.parentOrganizationId ?? null;
      if (parentId === id) {
        throw new BadRequestException('Tashkilot o`zini parent qila olmaydi');
      }
      if (parentId) {
        const parent = await this.orgRepo.findOne({ where: { id: parentId } });
        if (!parent) throw new BadRequestException('Parent tashkilot topilmadi');
      }
      org.parentOrganizationId = parentId;
    }
    if (dto.isDefault !== undefined) {
      if (dto.isDefault === true) {
        await this.orgRepo.update({ isDefault: true }, { isDefault: false });
        org.isDefault = true;
      } else {
        org.isDefault = false;
      }
    }
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
