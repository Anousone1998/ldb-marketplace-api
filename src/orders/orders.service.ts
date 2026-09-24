import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { ItemStatus, ItemType, OrderStatus } from '../common/enums';
import { multiplyMoney } from '../common/utils/money.util';
import { isPgError, PgErrorCode } from '../common/utils/sql.util';
import { Item, Order } from '../database/entities';
import { StorageService } from '../storage/storage.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';

/** Fail fast instead of queueing when another request holds the row lock. */
const LOCK_TIMEOUT = '5s';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  /**
   * Places an order inside a transaction:
   * 1. SELECT ... FOR UPDATE on the item (serializes concurrent buyers)
   * 2. verify it is AVAILABLE and not the buyer's own listing
   * 3. insert the PENDING order and flip the item to RESERVED
   */
  async create(buyerId: string, dto: CreateOrderDto): Promise<Order> {
    const itemId = String(dto.itemId);

    let orderId: string;
    try {
      orderId = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

        const item = await this.lockItem(manager, itemId);
        if (!item) throw new NotFoundException(`Item ${itemId} not found`);
        if (item.sellerId === buyerId) {
          throw new BadRequestException('You cannot order your own item');
        }
        if (item.status !== ItemStatus.AVAILABLE) {
          throw new ConflictException(`Item is no longer available (status: ${item.status})`);
        }

        const quantity = dto.quantity ?? 1;
        if (quantity > 1 && item.itemType !== ItemType.FOOD) {
          throw new BadRequestException('Only FOOD pre-orders can have a quantity greater than 1');
        }

        const order = manager.create(Order, {
          itemId: item.itemId,
          buyerId,
          sellerId: item.sellerId,
          quantity,
          totalAmount: multiplyMoney(item.price, quantity),
          status: OrderStatus.PENDING,
          paymentSlipUrl: null,
        });
        const saved = await manager.save(order);

        await manager.update(Item, { itemId: item.itemId }, { status: ItemStatus.RESERVED });
        return saved.orderId;
      });
    } catch (err) {
      // Defence in depth: the partial unique index rejects a second PENDING order per item.
      if (isPgError(err, PgErrorCode.UNIQUE_VIOLATION)) {
        throw new ConflictException('Item already has a pending order');
      }
      throw err;
    }

    return this.findOneForUser(orderId, buyerId);
  }

  /**
   * - COMPLETED: seller only → item becomes SOLD
   * - CANCELLED: buyer or seller → item goes back to AVAILABLE
   * Locks are taken item-first, the same order as create(), to avoid deadlocks.
   */
  async updateStatus(
    orderId: string,
    userId: string,
    status: OrderStatus.COMPLETED | OrderStatus.CANCELLED,
  ): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);

      const ref = await manager.findOne(Order, {
        where: { orderId },
        select: { orderId: true, itemId: true },
      });
      if (!ref) throw new NotFoundException(`Order ${orderId} not found`);

      const item = await this.lockItem(manager, ref.itemId);
      const order = await manager
        .getRepository(Order)
        .createQueryBuilder('ord')
        .setLock('pessimistic_write')
        .where('ord.orderId = :orderId', { orderId })
        .getOne();
      if (!order || !item) throw new NotFoundException(`Order ${orderId} not found`);

      const isSeller = order.sellerId === userId;
      const isBuyer = order.buyerId === userId;
      if (!isSeller && !isBuyer) throw new NotFoundException(`Order ${orderId} not found`);

      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException(`Order is already ${order.status}`);
      }

      if (status === OrderStatus.COMPLETED) {
        if (!isSeller) {
          throw new ForbiddenException('Only the seller can mark an order as completed');
        }
        await manager.update(Order, { orderId }, { status: OrderStatus.COMPLETED });
        await manager.update(Item, { itemId: item.itemId }, { status: ItemStatus.SOLD });
      } else {
        await manager.update(Order, { orderId }, { status: OrderStatus.CANCELLED });
        if (item.status === ItemStatus.RESERVED) {
          await manager.update(Item, { itemId: item.itemId }, { status: ItemStatus.AVAILABLE });
        }
      }
    });

    return this.findOneForUser(orderId, userId);
  }

  /** Buyer attaches proof of payment (image uploaded to storage beforehand). */
  async attachPaymentSlip(orderId: string, userId: string, paymentSlipUrl: string): Promise<Order> {
    this.storage.assertManagedUrls([paymentSlipUrl]);

    const order = await this.ordersRepo.findOne({ where: { orderId } });
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can attach a payment slip');
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException(`Cannot attach a payment slip to a ${order.status} order`);
    }

    await this.ordersRepo.update({ orderId }, { paymentSlipUrl });
    return this.findOneForUser(orderId, userId);
  }

  async findMine(userId: string, query: ListOrdersQueryDto): Promise<PaginatedResult<Order>> {
    const { page, size } = query;
    const qb = this.baseDetailQuery();

    if (query.role === 'buyer') {
      qb.where('ord.buyerId = :userId', { userId });
    } else if (query.role === 'seller') {
      qb.where('ord.sellerId = :userId', { userId });
    } else {
      qb.where(
        new Brackets((w) => {
          w.where('ord.buyerId = :userId', { userId }).orWhere('ord.sellerId = :userId', { userId });
        }),
      );
    }
    if (query.status) {
      qb.andWhere('ord.status = :status', { status: query.status });
    }

    qb.orderBy('ord.createdAt', 'DESC')
      .addOrderBy('ord.orderId', 'DESC')
      .offset((page - 1) * size)
      .limit(size);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, size);
  }

  /** Visible to the buyer and seller only; others get 404 so order IDs can't be probed. */
  async findOneForUser(orderId: string, userId: string): Promise<Order> {
    const order = await this.baseDetailQuery().where('ord.orderId = :orderId', { orderId }).getOne();
    if (!order || (order.buyerId !== userId && order.sellerId !== userId)) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return order;
  }

  private baseDetailQuery() {
    return this.ordersRepo
      .createQueryBuilder('ord')
      .leftJoin('ord.item', 'item')
      .addSelect(['item.itemId', 'item.title', 'item.itemType', 'item.status', 'item.images', 'item.pickupLocation'])
      .leftJoin('ord.buyer', 'buyer')
      .addSelect(['buyer.userId', 'buyer.fullName', 'buyer.department', 'buyer.phoneNumber'])
      .leftJoin('ord.seller', 'seller')
      .addSelect([
        'seller.userId',
        'seller.fullName',
        'seller.department',
        'seller.phoneNumber',
        'seller.qrPaymentUrl',
      ]);
  }

  /** SELECT ... FOR UPDATE without joins (Postgres forbids FOR UPDATE on the nullable side of outer joins). */
  private lockItem(manager: EntityManager, itemId: string): Promise<Item | null> {
    return manager
      .getRepository(Item)
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.itemId = :itemId', { itemId })
      .getOne();
  }
}
