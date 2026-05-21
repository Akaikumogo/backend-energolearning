import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/nes-sync',
  cors: { origin: true, credentials: true },
})
export class NesSyncGateway {
  @WebSocketServer()
  server!: Server;

  emitProgress(current: number, total: number, created: number) {
    this.server.emit('sync:progress', { current, total, created });
  }

  emitDone(result: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    date: string;
  }) {
    this.server.emit('sync:done', result);
  }

  emitError(message: string) {
    this.server.emit('sync:error', { message });
  }
}
