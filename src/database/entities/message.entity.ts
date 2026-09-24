import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Item } from './item.entity';
import { User } from './user.entity';

@Entity({ name: 'messages' })
@Index('IDX_messages_conversation', ['itemId', 'senderId', 'receiverId', 'createdAt'])
@Index('IDX_messages_sender', ['senderId'])
@Index('IDX_messages_receiver', ['receiverId'])
export class Message {
  @PrimaryGeneratedColumn('increment', {
    name: 'message_id',
    type: 'bigint',
    primaryKeyConstraintName: 'PK_messages',
  })
  messageId: string;

  @Column({ name: 'item_id', type: 'bigint' })
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'item_id', referencedColumnName: 'itemId', foreignKeyConstraintName: 'FK_messages_item' })
  item?: Item;

  @Column({ name: 'sender_id', type: 'varchar', length: 50 })
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'sender_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'FK_messages_sender' })
  sender?: User;

  @Column({ name: 'receiver_id', type: 'varchar', length: 50 })
  receiverId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'receiver_id',
    referencedColumnName: 'userId',
    foreignKeyConstraintName: 'FK_messages_receiver',
  })
  receiver?: User;

  @Column({ name: 'message_text', type: 'text' })
  messageText: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
