import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Applies runtime CORS config to Socket.io (gateway decorators are evaluated before env is loaded).
 * For multiple instances behind a load balancer, add @socket.io/redis-adapter here.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigin: string | string[],
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin, methods: ['GET', 'POST'] },
      pingInterval: 25_000,
      pingTimeout: 20_000,
      maxHttpBufferSize: 100_000, // chat payloads only; images go through REST uploads
    }) as Server;

    // Socket.io always has a default "/" namespace. Nothing is served there, so a client that
    // forgot "/chat" would look connected but never receive events; reject it loudly instead.
    server.of('/').use((_socket, next) => {
      next(new Error('Invalid namespace: connect to "<host>/chat", e.g. io("https://host/chat", { auth: { token } })'));
    });
    return server;
  }
}
