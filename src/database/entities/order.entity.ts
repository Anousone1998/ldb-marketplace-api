import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderStatus } from '../../common/enums';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { Item } from './item.entity';
import { User } from './user.entity';

@Entity({ name: 'orders' })
@Index('IDX_orders_item', ['itemId'])
@Index('IDX_orders_buyer_created', ['buyerId', 'createdAt'])
@Index('IDX_orders_seller_created', ['sellerId', 'createdAt'])
// Database-level guarantee: an item can have at most one PENDING order at a time.
@Index('UQ_orders_item_pending', ['itemId'], { unique: true, where: `"status" = 'PENDING'` })
@Check('CHK_orders_status', `"status" IN ('PENDING', 'COMPLETED', 'CANCELLED')`)
@Check('CHK_orders_quantity', `"quantity" > 0`)
@Check('CHK_orders_total_amount', `"total_amount" >= 0`)
@Check('CHK_orders_buyer_not_seller', `"buyer_id" <> "seller_id"`)
export class Order {
  @PrimaryGeneratedColumn('increment', {
    name: 'order_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_orders',
  })
  orderId: string;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'item_id', referencedColumnName: 'itemId', foreignKeyConstraintName: 'FK_orders_item' })
  item?: Item;

  @Column({ name: 'buyer_id', type: 'varchar', length: 50 })
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'buyer_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'FK_orders_buyer' })
  buyer?: User;

  @Column({ name: 'seller_id', type: 'varchar', length: 50 })
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'seller_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'FK_orders_seller' })
  seller?: User;

  @Column({ name: 'quantity', type: 'int', default: 1 })
  quantity: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  @Column({ name: 'status', type: 'varchar', length: 20, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ name: 'payment_slip_url', type: 'text', nullable: true })
  paymentSlipUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
