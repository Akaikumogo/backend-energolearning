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

  async create(data: { userId: string; title: string; body: string; data?: any | null }) {
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
}

