import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatsGateway } from './chats.gateway';
import { ChatsService } from './chats.service';
import { ChatHistoryQueryDto, ConversationsQueryDto, MarkReadDto, peerOf } from './dto/chat.dto';
import { PeerTokenService } from './peer-token.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly chatsGateway: ChatsGateway,
    private readonly peerTokens: PeerTokenService,
  ) {}

  /**
   * GET /api/v1/chats/history?itemId=1&withUserId=EMP00102&limit=50&beforeId=123
   * `withUserId` (alias `peerId`) is required for the seller (which buyer) and optional for a buyer.
   */
  @Get('history')
  @ResponseMessage('Chat history retrieved')
  history(@CurrentUser('userId') userId: string, @Query() query: ChatHistoryQueryDto) {
    return this.chatsService.getHistory(userId, query);
  }

  /** Inbox with last message + unread count per conversation. */
  @Get('conversations')
  @ResponseMessage('Conversations retrieved')
  conversations(@CurrentUser('userId') userId: string, @Query() query: ConversationsQueryDto) {
    return this.chatsService.getConversations(userId, query.page, query.size);
  }

  @Patch('read')
  @ResponseMessage('Messages marked as read')
  async markRead(@CurrentUser('userId') userId: string, @Body() dto: MarkReadDto) {
    const { itemId, peerId } = await this.chatsService.resolveConversation(
      String(dto.itemId),
      userId,
      peerOf(dto, this.peerTokens),
    );
    const count = await this.chatsService.markAsRead(userId, itemId, peerId);
    if (count > 0) this.chatsGateway.notifyRead(itemId, userId, peerId, count);
    return { count };
  }
}
