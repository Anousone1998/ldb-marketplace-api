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
import { NotificationType } from '../../common/enums';
import { Item } from './item.entity';
import { Order } from './order.entity';
import { User } from './user.entity';

@Entity({ name: 'notifications' })
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Check(
  'CHK_notifications_type',
  `"type" IN ('ORDER_PLACED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PAYMENT_SLIP_ATTACHED')`,
)
export class Notification {
  @PrimaryGeneratedColumn('increment', {
    name: 'notification_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_notifications',
  })
  notificationId: string;

  /** Recipient. */
  @Column({ name: 'user_id', type: 'varchar', length: 50 })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'FK_notifications_user' })
  user?: User;

  @Column({ name: 'type', type: 'varchar', length: 40 })
  type: NotificationType;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title: string;

  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null;

  @Column({ name: 'item_id', type: 'bigint', nullable: true })
  itemId: string | null;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'item_id', referencedColumnName: 'itemId', foreignKeyConstraintName: 'FK_notifications_item' })
  item?: Item | null;

  @Column({ name: 'order_id', type: 'bigint', nullable: true })
  orderId: string | null;

  @ManyToOne(() => Order, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'order_id', referencedColumnName: 'orderId', foreignKeyConstraintName: 'FK_notifications_order' })
  order?: Order | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
