import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Role } from '../common/enums/role.enum';
import {
  AiChatService,
  type AiChatScope,
  type AiChatTurn,
} from './ai-chat.service';

@WebSocketGateway({
  namespace: '/ai-chat',
  cors: { origin: true, credentials: true },
})
export class AiChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AiChatGateway.name);
  private readonly conversations = new Map<string, AiChatTurn[]>();

  constructor(
    private readonly jwt: JwtService,
    private readonly aiChatService: AiChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth as
        | { token?: string; scope?: string }
        | undefined;
      const header = client.handshake.headers.authorization;
      const raw = auth?.token ?? header;
      const token =
        typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;
      if (!token || typeof token !== 'string') {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify<{
        sub: string;
        role?: Role;
        organizationIds?: string[];
      }>(token);
      const scope = this.aiChatService.normalizeScope(payload.role, auth?.scope);
      const session = await this.aiChatService.getOrCreateSession(
        payload.sub,
        scope,
      );
      const historyRows = await this.aiChatService.getSessionMessages(session.id);

      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.data.organizationIds = payload.organizationIds ?? [];
      client.data.scope = scope;
      client.data.sessionId = session.id;
      this.conversations.set(
        client.id,
        historyRows.map((row) => ({
          role: row.role,
          content: row.content,
        })),
      );
      client.emit('assistant_ready', { ok: true, scope });
      client.emit('assistant_history', { messages: historyRows });
    } catch {
      this.logger.warn('AI chat disconnect: invalid token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.conversations.delete(client.id);
  }

  @SubscribeMessage('chat_message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { message?: string },
  ) {
    const userId = String(client.data.userId ?? '');
    const role = client.data.role as Role | undefined;
    const organizationIds = Array.isArray(client.data.organizationIds)
      ? (client.data.organizationIds as string[])
      : [];
    const scope = (client.data.scope as AiChatScope | undefined) ?? 'mobile';
    const sessionId = String(client.data.sessionId ?? '');
    const message = body?.message?.trim() ?? '';

    if (!userId || !sessionId || !role || !message) {
      client.emit('assistant_error', {
        message: 'Xabar bo`sh bo`lmasligi kerak',
      });
      return { ok: false };
    }

    const history = this.conversations.get(client.id) ?? [];
    const nextHistory = [...history, { role: 'user' as const, content: message }];
    this.conversations.set(client.id, nextHistory.slice(-12));
    await this.aiChatService.saveMessage(sessionId, 'user', message);

    client.emit('assistant_started', { messageId: Date.now().toString() });

    let fullResponse = '';

    try {
      await this.aiChatService.streamReply({
        userId,
        role,
        organizationIds,
        scope,
        message,
        history,
        onChunk: (chunk) => {
          fullResponse += chunk;
          client.emit('assistant_chunk', { chunk });
        },
      });

      const updatedHistory = [
        ...(this.conversations.get(client.id) ?? []),
        { role: 'assistant' as const, content: fullResponse },
      ];
      this.conversations.set(client.id, updatedHistory.slice(-12));
      await this.aiChatService.saveMessage(sessionId, 'assistant', fullResponse);

      client.emit('assistant_done', {
        message: fullResponse,
      });
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `AI chat failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.emit('assistant_error', {
        message:
          'AI yordamchi hozir javob bera olmadi. Birozdan keyin qayta urinib ko`ring.',
      });
      return { ok: false };
    }
  }
}
