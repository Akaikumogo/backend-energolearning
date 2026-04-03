import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  namespace: '/exam-live',
  cors: { origin: true, credentials: true },
})
export class ExamLiveGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ExamLiveGateway.name);

  constructor(private readonly jwt: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as { token?: string } | undefined;
      const header = client.handshake.headers.authorization;
      const raw = auth?.token ?? header;
      const token =
        typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (!token || typeof token !== 'string') {
        client.disconnect();
        return;
      }
      const payload = this.jwt.verify<{ sub: string; role?: string }>(token);
      client.data.userId = payload.sub;
      client.data.role = payload.role;
    } catch {
      this.logger.warn('WS disconnect: invalid token');
      client.disconnect();
    }
  }

  @SubscribeMessage('join_session')
  handleJoinSession(client: Socket, body: { sessionId?: string }) {
    const sessionId = body?.sessionId?.trim();
    if (!sessionId) return { ok: false, error: 'sessionId kerak' };
    void client.join(`session:${sessionId}`);
    return { ok: true };
  }

  @SubscribeMessage('join_org')
  handleJoinOrg(client: Socket, body: { organizationId?: string }) {
    const orgId = body?.organizationId?.trim();
    if (!orgId) return { ok: false, error: 'organizationId kerak' };
    if (client.data.role !== 'MODERATOR' && client.data.role !== 'SUPERADMIN') {
      return { ok: false, error: 'Ruxsat yo‘q' };
    }
    void client.join(`org:${orgId}`);
    return { ok: true };
  }

  emitToSession(sessionId: string, event: string, payload: unknown) {
    this.server.to(`session:${sessionId}`).emit(event, payload);
  }

  emitToOrg(organizationId: string, event: string, payload: unknown) {
    this.server.to(`org:${organizationId}`).emit(event, payload);
  }
}
