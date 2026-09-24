import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { paginate, PaginatedResult } from '../common/dto/pagination.dto';
import { ItemStatus, ItemType, OrderStatus } from '../common/enums';
import { escapeLike } from '../common/utils/sql.util';
import { Item, Order } from '../database/entities';
import { StorageService } from '../storage/storage.service';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsQueryDto } from './dto/list-items-query.dto';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly itemsRepo: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async findAll(query: ListItemsQueryDto): Promise<PaginatedResult<Item>> {
    const { page, size } = query;

    const qb = this.itemsRepo
      .createQueryBuilder('item')
      .leftJoin('item.seller', 'seller')
      .addSelect(['seller.userId', 'seller.fullName', 'seller.department']);

    if (query.q) {
      qb.andWhere('(item.title ILIKE :q OR item.description ILIKE :q)', { q: `%${escapeLike(query.q)}%` });
    }
    if (query.itemType) {
      qb.andWhere('item.itemType = :itemType', { itemType: query.itemType });
    }
    if (query.status) {
      qb.andWhere('item.status = :status', { status: query.status });
    } else {
      qb.andWhere('item.status <> :sold', { sold: ItemStatus.SOLD });
    }
    if (query.sellerId) {
      qb.andWhere('item.sellerId = :sellerId', { sellerId: query.sellerId });
    }

    // Many-to-one join cannot multiply rows, so plain OFFSET/LIMIT is safe here.
    qb.orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.itemId', 'DESC')
      .offset((page - 1) * size)
      .limit(size);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, page, size);
  }

  async findOne(itemId: string): Promise<Item> {
    const item = await this.itemsRepo
      .createQueryBuilder('item')
      .leftJoin('item.seller', 'seller')
      .addSelect([
        'seller.userId',
        'seller.fullName',
        'seller.department',
        'seller.phoneNumber',
        'seller.qrPaymentUrl',
      ])
      .where('item.itemId = :itemId', { itemId })
      .getOne();

    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    return item;
  }

  async create(sellerId: string, dto: CreateItemDto): Promise<Item> {
    const price = this.resolvePrice(dto.itemType, dto.price);
    const images = [...new Set(dto.images ?? [])];
    this.storage.assertManagedUrls(images);

    const item = this.itemsRepo.create({
      sellerId,
      title: dto.title,
      description: dto.description || null,
      price,
      itemType: dto.itemType,
      status: ItemStatus.AVAILABLE,
      pickupLocation: dto.pickupLocation,
      images,
    });
    const saved = await this.itemsRepo.save(item);
    return this.findOne(saved.itemId);
  }

  /**
   * Seller-only manual status change. Items with a PENDING order must be resolved via the
   * order endpoints so the order and item never disagree.
   */
  async updateStatus(itemId: string, userId: string, status: ItemStatus): Promise<Item> {
    await this.dataSource.transaction(async (manager) => {
      const item = await manager
        .getRepository(Item)
        .createQueryBuilder('item')
        .setLock('pessimistic_write')
        .where('item.itemId = :itemId', { itemId })
        .getOne();

      if (!item) throw new NotFoundException(`Item ${itemId} not found`);
      if (item.sellerId !== userId) {
        throw new ForbiddenException('Only the seller can change the status of this item');
      }
      if (item.status === status) return;

      const hasPendingOrder = await manager.exists(Order, {
        where: { itemId, status: OrderStatus.PENDING },
      });
      if (hasPendingOrder) {
        throw new ConflictException(
          'This item has a pending order. Complete or cancel the order via PATCH /api/v1/orders/:id/status',
        );
      }

      await manager.update(Item, { itemId }, { status });
    });

    return this.findOne(itemId);
  }

  private resolvePrice(itemType: ItemType, price: number | undefined): number {
    if (itemType === ItemType.FREE) {
      if (price !== undefined && price !== 0) {
        throw new BadRequestException('FREE items must have a price of 0');
      }
      return 0;
    }
    if (price === undefined || price <= 0) {
      throw new BadRequestException(`${itemType} items require a price greater than 0`);
    }
    return price;
  }
}
