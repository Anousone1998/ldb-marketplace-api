import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatsGateway } from '../chats/chats.gateway';
import { userRoom } from '../chats/chats.service';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { NotificationType, OrderStatus } from '../common/enums';
import { Notification, Order } from '../database/entities';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { PushService } from './push.service';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  itemId?: string | null;
  orderId?: string | null;
}

/**
 * Stores notifications and delivers them in real time over the `/chat` socket namespace
 * (every connected socket is already in its `user:<userId>` room) and as an FCM push to the
 * user's device.
 *
 * Server → client events:
 *   notification       Notification
 *   notificationsRead  { notificationId: string | null, unreadCount }  (null = all)
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly notificationsRepo: Repository<Notification>,
    private readonly chatsGateway: ChatsGateway,
    private readonly push: PushService,
  ) {}

  /**
   * Best effort: a failed notification is logged and never fails the action that triggered it.
   * Call after the triggering transaction has committed.
   */
  async notify(input: CreateNotificationInput): Promise<Notification | null> {
    try {
      const notification = await this.notificationsRepo.save(
        this.notificationsRepo.create({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          itemId: input.itemId ?? null,
          orderId: input.orderId ?? null,
          isRead: false,
        }),
      );
      this.chatsGateway.server?.to(userRoom(input.userId)).emit('notification', notification);
      await this.push.sendToUser(input.userId, notification);
      return notification;
    } catch (err) {
      this.logger.error(`Failed to notify ${input.userId} (${input.type})`, err instanceof Error ? err.stack : err);
      return null;
    }
  }

  /** New order → seller. */
  notifyOrderPlaced(order: Order): Promise<Notification | null> {
    const buyer = order.buyer?.fullName ?? order.buyerId;
    return this.notify({
      userId: order.sellerId,
      type: NotificationType.ORDER_PLACED,
      title: 'New order',
      body: `${buyer} ordered ${order.quantity} × ${order.item?.title ?? `item #${order.itemId}`}`,
      itemId: order.itemId,
      orderId: order.orderId,
    });
  }

  /** COMPLETED → buyer. CANCELLED → whichever party did not cancel. */
  notifyOrderStatusChanged(order: Order, changedBy: string): Promise<Notification | null> | null {
    const title = order.item?.title ?? `item #${order.itemId}`;
    if (order.status === OrderStatus.COMPLETED) {
      return this.notify({
        userId: order.buyerId,
        type: NotificationType.ORDER_COMPLETED,
        title: 'Order completed',
        body: `Your order for ${title} was marked as completed`,
        itemId: order.itemId,
        orderId: order.orderId,
      });
    }
    if (order.status === OrderStatus.CANCELLED) {
      const cancelledBySeller = changedBy === order.sellerId;
      return this.notify({
        userId: cancelledBySeller ? order.buyerId : order.sellerId,
        type: NotificationType.ORDER_CANCELLED,
        title: 'Order cancelled',
        body: `The ${cancelledBySeller ? 'seller' : 'buyer'} cancelled the order for ${title}`,
        itemId: order.itemId,
        orderId: order.orderId,
      });
    }
    return null;
  }

  /** Payment slip attached → seller. */
  notifyPaymentSlipAttached(order: Order): Promise<Notification | null> {
    const buyer = order.buyer?.fullName ?? order.buyerId;
    return this.notify({
      userId: order.sellerId,
      type: NotificationType.PAYMENT_SLIP_ATTACHED,
      title: 'Payment slip received',
      body: `${buyer} attached a payment slip for ${order.item?.title ?? `item #${order.itemId}`}`,
      itemId: order.itemId,
      orderId: order.orderId,
    });
  }

  async findMine(userId: string, query: ListNotificationsQueryDto): Promise<PaginatedResult<Notification>> {
    const { page, size } = query;
    const [data, total] = await this.notificationsRepo.findAndCount({
      where: query.unreadOnly ? { userId, isRead: false } : { userId },
      order: { createdAt: 'DESC', notificationId: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return paginate(data, total, page, size);
  }

  countUnread(userId: string): Promise<number> {
    return this.notificationsRepo.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationsRepo.findOne({ where: { notificationId, userId } });
    if (!notification) throw new NotFoundException(`Notification ${notificationId} not found`);

    if (!notification.isRead) {
      await this.notificationsRepo.update({ notificationId }, { isRead: true });
      notification.isRead = true;
      await this.emitRead(userId, notificationId);
    }
    return notification;
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.notificationsRepo.update({ userId, isRead: false }, { isRead: true });
    const count = result.affected ?? 0;
    if (count > 0) await this.emitRead(userId, null);
    return { count };
  }

  /** Keeps badges in sync across the user's other devices/tabs. */
  private async emitRead(userId: string, notificationId: string | null): Promise<void> {
    const unreadCount = await this.countUnread(userId);
    this.chatsGateway.server?.to(userRoom(userId)).emit('notificationsRead', { notificationId, unreadCount });
  }
}
