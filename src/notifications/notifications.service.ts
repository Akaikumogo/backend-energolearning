import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../database/entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    body: string;
    data?: any | null;
  }) {
    return this.repo.save(
      this.repo.create({
        userId: data.userId,
        title: data.title,
        body: data.body,
        data: data.data ?? null,
        isRead: false,
      }),
    );
  }

  async listForUser(userId: string) {
    const rows = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      data: n.data,
      isRead: n.isRead,
      createdAt: n.createdAt,
    }));
  }

  async markRead(id: string, userId: string) {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) return null;
    row.isRead = true;
    await this.repo.save(row);
    return this.mapOne(row);
  }

  async resolve(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) return;
    row.isRead = true;
    row.data = {
      ...(row.data && typeof row.data === 'object' ? row.data : {}),
      resolved: true,
      resolvedAt: new Date().toISOString(),
    };
    await this.repo.save(row);
  }

  async resolveByChangeId(changeId: string) {
    const rows = await this.repo
      .createQueryBuilder('n')
      .where(`n.data->>'changeId' = :changeId`, { changeId })
      .andWhere(`(n.data->>'resolved') IS DISTINCT FROM 'true'`)
      .getMany();
    for (const row of rows) {
      row.isRead = true;
      row.data = {
        ...(row.data && typeof row.data === 'object' ? row.data : {}),
        resolved: true,
        resolvedAt: new Date().toISOString(),
      };
      await this.repo.save(row);
    }
  }

  private mapOne(n: Notification) {
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      data: n.data,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  }
}

