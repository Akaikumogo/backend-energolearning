import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Role } from '../common/enums/role.enum';
import { ProctorService } from './proctor.service';

@WebSocketGateway({
  namespace: '/proctor-live',
  cors: { origin: true, credentials: true },
})
export class ProctorGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ProctorGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly proctor: ProctorService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      const header = client.handshake.headers.authorization;
      const raw = auth?.token ?? header;
      const token = typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (!token || typeof token !== 'string') {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{ sub: string; role?: Role }>(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.data.organizationIds = [];
    } catch {
      this.logger.warn('proctor ws: token rad etildi');
      client.disconnect();
    }
  }

  @SubscribeMessage('join_room')
  async join(client: Socket, body: { roomId?: string }) {
    const roomId = body?.roomId?.trim();
    if (!roomId || !client.data.userId) return { ok: false };
    try {
      const room = await this.proctor.assertWatch(
        {
          id: client.data.userId,
          role: client.data.role ?? Role.USER,
          organizationIds: client.data.organizationIds,
        },
        roomId,
      );
      await client.join(`room:${roomId}`);
      return {
        ok: true,
        live: room.connectionStatus === 'ONLINE' && room.status === 'IN_PROGRESS',
        lastSeenAt: room.lastSeenAt,
        connectionStatus: room.connectionStatus,
      };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('signal')
  signal(client: Socket, body: { roomId?: string; payload?: unknown }) {
    const roomId = body?.roomId?.trim();
    if (!roomId || !client.rooms.has(`room:${roomId}`)) return { ok: false };
    client.to(`room:${roomId}`).emit('signal', {
      from: client.data.userId,
      payload: body.payload ?? null,
    });
    return { ok: true };
  }
}
