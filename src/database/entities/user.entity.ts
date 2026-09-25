import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users' })
@Index('UQ_users_fcm_token', ['fcmToken'], { unique: true })
export class User {
  @PrimaryColumn({
    name: 'user_id',
    type: 'varchar',
    length: 50,
    primaryKeyConstraintName: 'PK_users',
  })
  userId: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 25, nullable: true })
  phoneNumber: string | null;

  @Column({ name: 'qr_payment_url', type: 'text', nullable: true })
  qrPaymentUrl: string | null;

  /** Firebase Cloud Messaging device token. Never returned by default (`select: false`). */
  @Column({ name: 'fcm_token', type: 'text', nullable: true, select: false })
  fcmToken?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
