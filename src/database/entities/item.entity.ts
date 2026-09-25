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
import { ItemStatus, ItemType } from '../../common/enums';
import { decimalTransformer } from '../transformers/decimal.transformer';
import { User } from './user.entity';

@Entity({ name: 'items' })
@Index('IDX_items_status_type_created', ['status', 'itemType', 'createdAt'])
@Index('IDX_items_seller', ['sellerId'])
@Check('CHK_items_item_type', `"item_type" IN ('SECOND_HAND', 'FOOD', 'FREE', 'HOUSEHOLD')`)
@Check('CHK_items_status', `"status" IN ('AVAILABLE', 'RESERVED', 'SOLD')`)
@Check('CHK_items_price', `"price" >= 0`)
@Check('CHK_items_quantity', `"quantity" >= 0`)
export class Item {
  /** bigint is returned by node-postgres as a string to avoid precision loss. */
  @PrimaryGeneratedColumn('increment', {
    name: 'item_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_items',
  })
  itemId: string;

  @Column({ name: 'seller_id', type: 'varchar', length: 50 })
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'seller_id',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'FK_items_seller',
  })
  seller?: User;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  price: number;

  /** Units in stock. Decremented when an order is COMPLETED; the item becomes SOLD at 0. */
  @Column({ name: 'quantity', type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'item_type', type: 'varchar', length: 20 })
  itemType: ItemType;

  @Column({ name: 'status', type: 'varchar', length: 20, default: ItemStatus.AVAILABLE })
  status: ItemStatus;

  @Column({ name: 'pickup_location', type: 'varchar', length: 150 })
  pickupLocation: string;

  @Column({ name: 'images', type: 'text', array: true, default: () => `'{}'` })
  images: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
