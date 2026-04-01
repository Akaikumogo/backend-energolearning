import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_MODERATOR_PERMISSIONS,
  type ModeratorPermissions,
  ModeratorPermission,
} from '../database/entities/moderator-permission.entity';
import { ModeratorViolation } from '../database/entities/moderator-violation.entity';

@Injectable()
export class ModeratorPermissionsService {
  constructor(
    @InjectRepository(ModeratorPermission)
    private readonly permRepo: Repository<ModeratorPermission>,
    @InjectRepository(ModeratorViolation)
    private readonly violationRepo: Repository<ModeratorViolation>,
  ) {}

  async getOrCreate(moderatorUserId: string): Promise<ModeratorPermission> {
    const existing = await this.permRepo.findOne({ where: { moderatorUserId } });
    if (existing) return existing;

    const created = this.permRepo.create({
      moderatorUserId,
      permissions: DEFAULT_MODERATOR_PERMISSIONS,
    });
    return this.permRepo.save(created);
  }

  async setPermissions(
    moderatorUserId: string,
    permissions: ModeratorPermissions,
  ): Promise<ModeratorPermission> {
    const existing = await this.getOrCreate(moderatorUserId);
    existing.permissions = permissions;
    return this.permRepo.save(existing);
  }

  async logViolation(data: {
    moderatorUserId: string;
    organizationId?: string | null;
    actionKey: string;
    method: string;
    path: string;
    requestBodyPreview?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const row = this.violationRepo.create({
      moderatorUserId: data.moderatorUserId,
      organizationId: data.organizationId ?? null,
      actionKey: data.actionKey,
      method: data.method,
      path: data.path,
      requestBodyPreview: data.requestBodyPreview ?? null,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
    });
    await this.violationRepo.save(row);
  }

  async listViolations(filters: {
    range: 'today' | 'month' | 'year';
    moderatorUserId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Array<{
      id: string;
      moderatorUserId: string;
      moderator: { id: string; firstName: string; lastName: string; email: string } | null;
      organizationId: string | null;
      actionKey: string;
      method: string;
      path: string;
      ip: string | null;
      userAgent: string | null;
      requestBodyPreview: string | null;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
    from: string;
    to: string;
  }> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);

    const now = new Date();
    const from = new Date(now);
    if (filters.range === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (filters.range === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    } else {
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
    }

    const to = new Date(now);

    const qb = this.violationRepo
      .createQueryBuilder('v')
      .leftJoin('v.moderatorUser', 'u')
      .where('v.created_at >= :from AND v.created_at <= :to', { from, to })
      .orderBy('v.created_at', 'DESC');

    if (filters.moderatorUserId) {
      qb.andWhere('v.moderator_user_id = :moderatorUserId', {
        moderatorUserId: filters.moderatorUserId,
      });
    }

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'v.id AS id',
        'v.moderator_user_id AS "moderatorUserId"',
        'v.organization_id AS "organizationId"',
        'v.action_key AS "actionKey"',
        'v.method AS method',
        'v.path AS path',
        'v.ip AS ip',
        'v.user_agent AS "userAgent"',
        'v.request_body_preview AS "requestBodyPreview"',
        'v.created_at AS "createdAt"',
        'u.id AS "u_id"',
        'u.first_name AS "u_firstName"',
        'u.last_name AS "u_lastName"',
        'u.email AS "u_email"',
      ])
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        moderatorUserId: string;
        organizationId: string | null;
        actionKey: string;
        method: string;
        path: string;
        ip: string | null;
        userAgent: string | null;
        requestBodyPreview: string | null;
        createdAt: Date;
        u_id: string | null;
        u_firstName: string | null;
        u_lastName: string | null;
        u_email: string | null;
      }>();

    return {
      data: rows.map((r) => ({
        id: r.id,
        moderatorUserId: r.moderatorUserId,
        moderator: r.u_id
          ? {
              id: r.u_id,
              firstName: r.u_firstName ?? '',
              lastName: r.u_lastName ?? '',
              email: r.u_email ?? '',
            }
          : null,
        organizationId: r.organizationId,
        actionKey: r.actionKey,
        method: r.method,
        path: r.path,
        ip: r.ip,
        userAgent: r.userAgent,
        requestBodyPreview: r.requestBodyPreview,
        createdAt: new Date(r.createdAt),
      })),
      total,
      page,
      limit,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}

