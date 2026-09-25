import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotifications1759000000000 implements MigrationInterface {
  name = 'AddNotifications1759000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "notification_id" BIGSERIAL    NOT NULL,
        "user_id"         varchar(50)  NOT NULL,
        "type"            varchar(40)  NOT NULL,
        "title"           varchar(200) NOT NULL,
        "body"            text,
        "item_id"         bigint,
        "order_id"        bigint,
        "is_read"         boolean      NOT NULL DEFAULT false,
        "created_at"      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("notification_id"),
        CONSTRAINT "CHK_notifications_type"
          CHECK ("type" IN ('ORDER_PLACED', 'ORDER_COMPLETED', 'ORDER_CANCELLED', 'PAYMENT_SLIP_ATTACHED')),
        CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id")
          REFERENCES "users" ("user_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notifications_item" FOREIGN KEY ("item_id")
          REFERENCES "items" ("item_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notifications_order" FOREIGN KEY ("order_id")
          REFERENCES "orders" ("order_id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_unread" ON "notifications" ("user_id") WHERE "is_read" = false`,
    );
    await queryRunner.query(`ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
