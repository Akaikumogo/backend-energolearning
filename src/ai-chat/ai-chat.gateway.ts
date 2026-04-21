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
import { AiChatService, type AiChatTurn } from './ai-chat.service';

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
      this.conversations.set(client.id, []);
      client.emit('assistant_ready', { ok: true });
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
    const message = body?.message?.trim() ?? '';

    if (!userId || !message) {
      client.emit('assistant_error', {
        message: 'Xabar bo`sh bo`lmasligi kerak',
      });
      return { ok: false };
    }

    const history = this.conversations.get(client.id) ?? [];
    const nextHistory = [...history, { role: 'user' as const, content: message }];
    this.conversations.set(client.id, nextHistory.slice(-12));

    client.emit('assistant_started', { messageId: Date.now().toString() });

    let fullResponse = '';

    try {
      await this.aiChatService.streamReply({
        userId,
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
