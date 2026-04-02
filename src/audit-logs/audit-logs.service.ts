import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminAuditLog } from '../database/entities/admin-audit-log.entity';

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly repo: Repository<AdminAuditLog>,
  ) {}

  async write(data: {
    actorUserId: string | null;
    actorRole: string | null;
    actorOrganizationIds: string[] | null;
    method: string;
    path: string;
    statusCode: number;
    errorMessage?: string | null;
    requestBodyPreview?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    durationMs?: number | null;
  }) {
    const row = this.repo.create({
      actorUserId: data.actorUserId,
      actorRole: data.actorRole,
      actorOrganizationIds: data.actorOrganizationIds,
      method: data.method,
      path: data.path,
      statusCode: data.statusCode,
      errorMessage: data.errorMessage ?? null,
      requestBodyPreview: data.requestBodyPreview ?? null,
      ip: data.ip ?? null,
      userAgent: data.userAgent ?? null,
      durationMs: data.durationMs ?? null,
    });
    await this.repo.save(row);
  }

  async list(filters: {
    range: 'today' | 'month' | 'year';
    actorId?: string;
    orgId?: string;
    statusCode?: number;
    page?: number;
    limit?: number;
  }) {
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

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.created_at >= :from AND a.created_at <= :to', { from, to })
      .orderBy('a.created_at', 'DESC');

    if (filters.actorId) {
      qb.andWhere('a.actor_user_id = :actorId', { actorId: filters.actorId });
    }
    if (filters.statusCode) {
      qb.andWhere('a.status_code = :statusCode', {
        statusCode: filters.statusCode,
      });
    }
    if (filters.orgId) {
      // jsonb array contains
      qb.andWhere('a.actor_organization_ids @> :orgIdJson', {
        orgIdJson: JSON.stringify([filters.orgId]),
      });
    }

    const total = await qb.getCount();
    const rows = await qb
      .offset((page - 1) * limit)
      .limit(limit)
      .getMany();

    return {
      data: rows.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorRole: r.actorRole,
        actorOrganizationIds: r.actorOrganizationIds ?? [],
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        errorMessage: r.errorMessage,
        requestBodyPreview: r.requestBodyPreview,
        ip: r.ip,
        userAgent: r.userAgent,
        durationMs: r.durationMs,
        createdAt: r.createdAt,
      })),
      total,
      page,
      limit,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}

