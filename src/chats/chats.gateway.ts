import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { extractSocketToken } from '../auth/token.util';
import { flattenValidationErrors } from '../common/utils/validation.util';
import { ChatsService, conversationRoom, userRoom } from './chats.service';
import { JoinChatDto, MarkReadDto, peerOf, SendMessageDto } from './dto/chat.dto';
import { WsExceptionsFilter } from './filters/ws-exceptions.filter';

interface SocketData {
  user: AuthUser;
}

function wsSuccess<T>(message: string, data: T) {
  return { status: 'success' as const, statusCode: 200, message, data };
}

type ChatSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>;

/**
 * Socket.io namespace `/chat`.
 *
 * Connect:   io('<host>/chat', { auth: { token: '<JWT>' } })
 * Client → server (use emitWithAck; acks use the same envelope as the REST API):
 *   { status: 'success', statusCode: 200, message, data } | { status: 'error', statusCode, message, errors?, data: null }
 *   joinChat    { itemId, withUserId? | peerId? }
 *   leaveChat   { itemId, withUserId? | peerId? }
 *   sendMessage { itemId, receiverId, messageText, senderId? }
 *   markRead    { itemId, withUserId? | peerId? }
 * Server → client:
 *   newMessage    Message
 *   messagesRead  { itemId, readerId, count }
 *   exception     error envelope (only when the client sent no ack callback)
 *
 * Every socket automatically joins `user:<userId>`, so new messages reach the receiver even
 * when they have not opened that conversation (e.g. for inbox badges).
 */
@UseFilters(new WsExceptionsFilter())
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new WsException({ message: 'Validation failed', errors: flattenValidationErrors(errors) }),
  }),
)
@WebSocketGateway({ namespace: '/chat' })
export class ChatsGateway implements OnGatewayInit<Namespace>, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatsGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(
    private readonly chatsService: ChatsService,
    private readonly authService: AuthService,
  ) {}

  /** Authenticates during the handshake, before any event handler can run. */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      const token = extractSocketToken(socket);
      if (!token) {
        next(new Error('Unauthorized: missing token'));
        return;
      }
      this.authService
        .verifyToken(token)
        .then((user) => {
          (socket as ChatSocket).data.user = user;
          next();
        })
        .catch(() => next(new Error('Unauthorized: invalid or expired token')));
    });
  }

  async handleConnection(client: ChatSocket): Promise<void> {
    const user = client.data.user;
    await client.join(userRoom(user.userId));
    this.logger.debug(`Connected ${user.userId} (${client.id})`);
  }

  handleDisconnect(client: ChatSocket): void {
    this.logger.debug(`Disconnected ${client.data.user?.userId ?? 'unknown'} (${client.id})`);
  }

  @SubscribeMessage('joinChat')
  async joinChat(@ConnectedSocket() client: ChatSocket, @MessageBody() dto: JoinChatDto) {
    const me = client.data.user.userId;
    const { itemId, peerId, sellerId } = await this.chatsService.resolveConversation(
      String(dto.itemId),
      me,
      peerOf(dto),
    );

    const room = conversationRoom(itemId, me, peerId);
    await client.join(room);

    const count = await this.chatsService.markAsRead(me, itemId, peerId);
    if (count > 0) {
      this.server.to(room).to(userRoom(peerId)).emit('messagesRead', { itemId, readerId: me, count });
    }

    return wsSuccess('Joined chat', { itemId, peerId, sellerId, room });
  }

  @SubscribeMessage('leaveChat')
  async leaveChat(@ConnectedSocket() client: ChatSocket, @MessageBody() dto: JoinChatDto) {
    const me = client.data.user.userId;
    const { itemId, peerId } = await this.chatsService.resolveConversation(String(dto.itemId), me, peerOf(dto));
    await client.leave(conversationRoom(itemId, me, peerId));
    return wsSuccess('Left chat', null);
  }

  @SubscribeMessage('sendMessage')
  async sendMessage(@ConnectedSocket() client: ChatSocket, @MessageBody() dto: SendMessageDto) {
    const me = client.data.user.userId;
    if (dto.senderId && dto.senderId !== me) {
      throw new WsException('senderId does not match the authenticated user');
    }

    const message = await this.chatsService.createMessage(me, dto);
    const room = conversationRoom(message.itemId, message.senderId, message.receiverId);

    // Rooms are de-duplicated by socket.io; the sending socket gets the message via its ack.
    this.server
      .to(room)
      .to(userRoom(message.receiverId))
      .to(userRoom(message.senderId))
      .except(client.id)
      .emit('newMessage', message);

    return wsSuccess('Message sent', message);
  }

  @SubscribeMessage('markRead')
  async markRead(@ConnectedSocket() client: ChatSocket, @MessageBody() dto: MarkReadDto) {
    const me = client.data.user.userId;
    const { itemId, peerId } = await this.chatsService.resolveConversation(String(dto.itemId), me, peerOf(dto));
    const count = await this.chatsService.markAsRead(me, itemId, peerId);
    if (count > 0) this.notifyRead(itemId, me, peerId, count);
    return wsSuccess('Messages marked as read', { count });
  }

  /** Also used by the REST controller so read receipts stay in sync across transports. */
  notifyRead(itemId: string, readerId: string, peerId: string, count: number): void {
    this.server
      .to(conversationRoom(itemId, readerId, peerId))
      .to(userRoom(peerId))
      .to(userRoom(readerId))
      .emit('messagesRead', { itemId, readerId, count });
  }
}
