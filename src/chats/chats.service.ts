import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { Item, Message, User } from '../database/entities';
import { ChatHistoryQueryDto, peerOf, SendMessageDto } from './dto/chat.dto';

export interface ResolvedConversation {
  itemId: string;
  sellerId: string;
  peerId: string;
}

export interface ConversationSummary {
  itemId: string;
  itemTitle: string;
  itemImage: string | null;
  itemStatus: string;
  sellerId: string;
  peerId: string;
  peerName: string;
  lastMessageId: string;
  lastMessageText: string;
  lastSenderId: string;
  lastMessageAt: Date;
  unreadCount: number;
}

export function conversationRoom(itemId: string, userA: string, userB: string): string {
  const [first, second] = [userA, userB].sort();
  return `chat:${itemId}:${first}:${second}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Message) private readonly messagesRepo: Repository<Message>,
    @InjectRepository(Item) private readonly itemsRepo: Repository<Item>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  /**
   * Resolves who the current user is talking to about an item.
   * Every conversation is between the item's seller and one other employee.
   */
  async resolveConversation(itemId: string, userId: string, withUserId?: string): Promise<ResolvedConversation> {
    const item = await this.itemsRepo.findOne({
      where: { itemId },
      select: { itemId: true, sellerId: true },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    let peerId: string;
    if (item.sellerId === userId) {
      if (!withUserId) {
        throw new BadRequestException('withUserId (or peerId) of the buyer is required when the seller opens a chat');
      }
      if (withUserId === userId) throw new BadRequestException('You cannot chat with yourself');
      peerId = withUserId;
    } else {
      if (withUserId && withUserId !== item.sellerId) {
        throw new ForbiddenException('Buyers can only chat with the seller of the item');
      }
      peerId = item.sellerId;
    }

    return { itemId: item.itemId, sellerId: item.sellerId, peerId };
  }

  async createMessage(senderId: string, dto: SendMessageDto): Promise<Message> {
    const itemId = String(dto.itemId);
    if (dto.receiverId === senderId) {
      throw new BadRequestException('You cannot message yourself');
    }

    const conversation = await this.resolveConversation(itemId, senderId, dto.receiverId);
    const receiverExists = await this.usersRepo.existsBy({ userId: conversation.peerId });
    if (!receiverExists) throw new NotFoundException(`Employee ${conversation.peerId} not found`);

    const message = this.messagesRepo.create({
      itemId,
      senderId,
      receiverId: conversation.peerId,
      messageText: dto.messageText,
      isRead: false,
    });
    return this.messagesRepo.save(message);
  }

  /** Newest-first cursor pagination, returned in chronological order for rendering. */
  async getHistory(userId: string, query: ChatHistoryQueryDto) {
    const { itemId, peerId } = await this.resolveConversation(String(query.itemId), userId, peerOf(query));

    const qb = this.messagesRepo
      .createQueryBuilder('m')
      .where('m.itemId = :itemId', { itemId })
      .andWhere(
        new Brackets((w) => {
          w.where('(m.senderId = :me AND m.receiverId = :peer)').orWhere('(m.senderId = :peer AND m.receiverId = :me)');
        }),
      )
      .setParameters({ me: userId, peer: peerId });

    if (query.beforeId) {
      qb.andWhere('m.messageId < :beforeId', { beforeId: String(query.beforeId) });
    }

    const rows = await qb
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.messageId', 'DESC')
      .limit(query.limit + 1)
      .getMany();

    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit).reverse();

    return new PaginatedResult(page, {
      itemId,
      peerId,
      hasMore,
      nextBeforeId: hasMore && page.length > 0 ? page[0].messageId : null,
    });
  }

  /** Marks messages sent by the peer to the current user as read. Returns affected count. */
  async markAsRead(userId: string, itemId: string, peerId: string): Promise<number> {
    const result = await this.messagesRepo.update(
      { itemId, senderId: peerId, receiverId: userId, isRead: false },
      { isRead: true },
    );
    return result.affected ?? 0;
  }

  /** Inbox: one row per (item, peer) with the latest message and unread count. */
  async getConversations(userId: string, page: number, size: number) {
    const rows: ConversationSummary[] = await this.messagesRepo.query(
      `
      WITH mine AS (
        SELECT m.*,
               CASE WHEN m.sender_id = $1 THEN m.receiver_id ELSE m.sender_id END AS peer_id
        FROM messages m
        WHERE m.sender_id = $1 OR m.receiver_id = $1
      ),
      latest AS (
        SELECT DISTINCT ON (item_id, peer_id)
               item_id, peer_id, message_id, message_text, sender_id, created_at
        FROM mine
        ORDER BY item_id, peer_id, created_at DESC, message_id DESC
      ),
      unread AS (
        SELECT item_id, sender_id AS peer_id, COUNT(*)::int AS unread_count
        FROM messages
        WHERE receiver_id = $1 AND is_read = false
        GROUP BY item_id, sender_id
      )
      SELECT l.item_id::text          AS "itemId",
             i.title                  AS "itemTitle",
             i.images[1]              AS "itemImage",
             i.status                 AS "itemStatus",
             i.seller_id              AS "sellerId",
             l.peer_id                AS "peerId",
             u.full_name              AS "peerName",
             l.message_id::text       AS "lastMessageId",
             l.message_text           AS "lastMessageText",
             l.sender_id              AS "lastSenderId",
             l.created_at             AS "lastMessageAt",
             COALESCE(r.unread_count, 0) AS "unreadCount",
             COUNT(*) OVER()::int     AS "totalCount"
      FROM latest l
      JOIN items i ON i.item_id = l.item_id
      JOIN users u ON u.user_id = l.peer_id
      LEFT JOIN unread r ON r.item_id = l.item_id AND r.peer_id = l.peer_id
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, size, (page - 1) * size],
    );

    const total = rows.length > 0 ? (rows[0] as ConversationSummary & { totalCount: number }).totalCount : 0;
    const data = rows.map(({ totalCount: _omit, ...row }: ConversationSummary & { totalCount?: number }) => row);

    return new PaginatedResult(data, { page, size, total, totalPages: Math.ceil(total / size) });
  }
}
