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
import { AiChatService, type AiChatScope } from './ai-chat.service';

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

      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.data.organizationIds = payload.organizationIds ?? [];
      client.data.scope = scope;
      this.logger.log(
        `AI socket connected: client=${client.id} user=${payload.sub} role=${payload.role ?? '-'} scope=${scope}`,
      );
      client.emit('assistant_ready', { ok: true, scope });
      client.emit('assistant_history', { messages: [] });
    } catch (error) {
      this.logger.warn(
        `AI chat disconnect: invalid token or session init failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `AI socket disconnected: client=${client.id} user=${String(
        client.data.userId ?? '-',
      )} scope=${String(client.data.scope ?? '-')}`,
    );
  }

  @SubscribeMessage('chat_message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { message?: string },
  ) {
    const userId = String(client.data.userId ?? '');
    const role = client.data.role as Role | undefined;
    const scope = (client.data.scope as AiChatScope | undefined) ?? 'mobile';
    const message = body?.message?.trim() ?? '';

    if (!userId || !role || !message) {
      this.logger.warn(
        `AI message rejected: client=${client.id} user=${userId || '-'} role=${role || '-'} empty=${message.length === 0}`,
      );
      client.emit('assistant_error', {
        message: 'Xabar bo`sh bo`lmasligi kerak',
      });
      return { ok: false };
    }

    this.logger.log(
      `AI message received: client=${client.id} user=${userId} role=${role} scope=${scope} chars=${message.length}`,
    );

    client.emit('assistant_started', { messageId: Date.now().toString() });

    let fullResponse = '';

    try {
      await this.aiChatService.streamReply({
        userId,
        scope,
        message,
        onChunk: (chunk) => {
          const safe = this.scrubIds(chunk);
          fullResponse += safe;
          client.emit('assistant_chunk', { chunk: safe });
        },
      });

      this.logger.log(
        `AI response ready: user=${userId} scope=${scope} chars=${fullResponse.length}`,
      );

      client.emit('assistant_done', {
        message: this.scrubIds(fullResponse),
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

  private scrubIds(text: string) {
    if (!text) return text;
    let out = text;
    out = out.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[id]',
    );
    out = out.replace(/\b\d{9,}\b/g, '[id]');
    out = out.replace(/\b(?:user|uid|id|uuid)\s*[:=]\s*\S+/gi, (m) =>
      m.replace(/[:=].*$/, ': [id]'),
    );
    return out;
  }
}
