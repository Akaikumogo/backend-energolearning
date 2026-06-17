import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserActivityService } from './user-activity.service';
import { Role } from '../common/enums/role.enum';
import { ActivityEventType } from '../database/entities/user-activity-event.entity';

interface SocketData {
  userId: string;
  role: Role;
  organizationIds: string[];
}

@WebSocketGateway({
  namespace: '/user-activity',
  cors: { origin: true, credentials: true },
})
export class UserActivityGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(UserActivityGateway.name);
  private readonly socketsByUser = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly service: UserActivityService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      const header = client.handshake.headers.authorization;
      const raw = auth?.token ?? header;
      const token =
        typeof raw === 'string' && raw.startsWith('Bearer ')
          ? raw.slice(7)
          : raw;
      if (!token || typeof token !== 'string') {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{
        sub: string;
        role?: Role;
        organizationIds?: string[];
      }>(token);

      const data: SocketData = {
        userId: payload.sub,
        role: payload.role ?? Role.USER,
        organizationIds: payload.organizationIds ?? [],
      };
      client.data = data;

      // Track multiple sockets per user (tabs/devices)
      const set = this.socketsByUser.get(data.userId) ?? new Set();
      set.add(client.id);
      this.socketsByUser.set(data.userId, set);

      // Faqat birinchi socket bo'lsa — yangi session ochamiz, aks holda heartbeat
      if (set.size === 1) {
        const ipAddress =
          (client.handshake.headers['x-forwarded-for'] as string)?.split(
            ',',
          )[0] ??
          client.handshake.address ??
          null;
        const userAgent =
          (client.handshake.headers['user-agent'] as string) ?? null;
        await this.service.startSession({
          userId: data.userId,
          ipAddress,
          userAgent,
        });
      } else {
        await this.service.heartbeat(data.userId);
      }

      // Moderator/SuperAdmin uchun observer roomlariga qo'shamiz
      if (data.role === Role.MODERATOR || data.role === Role.SUPERADMIN) {
        await client.join('observers:all');
        for (const orgId of data.organizationIds) {
          await client.join(`observers:${orgId}`);
        }
      }

      this.broadcastOnlineUpdate(data, 'online');
    } catch (err) {
      this.logger.warn(`WS reject: ${(err as Error).message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as SocketData | undefined;
    if (!data?.userId) return;
    const set = this.socketsByUser.get(data.userId);
    if (set) {
      set.delete(client.id);
      if (set.size === 0) {
        this.socketsByUser.delete(data.userId);
        await this.service.endSession(data.userId, 'logout');
        this.broadcastOnlineUpdate(data, 'offline');
      }
    }
  }

  @SubscribeMessage('heartbeat')
  async handleHeartbeat(client: Socket) {
    const data = client.data as SocketData | undefined;
    if (!data?.userId) return { ok: false };
    await this.service.heartbeat(data.userId);
    return { ok: true, ts: Date.now() };
  }

  @SubscribeMessage('event')
  async handleEvent(
    client: Socket,
    body: {
      eventType: ActivityEventType;
      entityType?: string;
      entityId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const data = client.data as SocketData | undefined;
    if (!data?.userId) return { ok: false };
    await this.service.recordEvent({
      userId: data.userId,
      eventType: body.eventType,
      entityType: body.entityType,
      entityId: body.entityId,
      metadata: body.metadata,
    });
    return { ok: true };
  }

  private broadcastOnlineUpdate(data: SocketData, status: 'online' | 'offline') {
    const payload = {
      userId: data.userId,
      status,
      at: new Date().toISOString(),
    };
    this.server.to('observers:all').emit('user_status', payload);
    for (const orgId of data.organizationIds) {
      this.server.to(`observers:${orgId}`).emit('user_status', payload);
    }
  }
}
