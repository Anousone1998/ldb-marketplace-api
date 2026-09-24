import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1758700000000 implements MigrationInterface {
  name = 'InitialSchema1758700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "user_id"        varchar(50)  NOT NULL,
        "full_name"      varchar(150) NOT NULL,
        "department"     varchar(100),
        "phone_number"   varchar(25),
        "qr_payment_url" text,
        "created_at"     timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("user_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "items" (
        "item_id"         BIGSERIAL     NOT NULL,
        "seller_id"       varchar(50)   NOT NULL,
        "title"           varchar(200)  NOT NULL,
        "description"     text,
        "price"           numeric(12,2) NOT NULL DEFAULT 0,
        "item_type"       varchar(20)   NOT NULL,
        "status"          varchar(20)   NOT NULL DEFAULT 'AVAILABLE',
        "pickup_location" varchar(150)  NOT NULL,
        "images"          text[]        NOT NULL DEFAULT '{}',
        "created_at"      timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_items" PRIMARY KEY ("item_id"),
        CONSTRAINT "CHK_items_item_type" CHECK ("item_type" IN ('SECOND_HAND', 'FOOD', 'FREE')),
        CONSTRAINT "CHK_items_status" CHECK ("status" IN ('AVAILABLE', 'RESERVED', 'SOLD')),
        CONSTRAINT "CHK_items_price" CHECK ("price" >= 0),
        CONSTRAINT "FK_items_seller" FOREIGN KEY ("seller_id")
          REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_items_status_type_created" ON "items" ("status", "item_type", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_items_seller" ON "items" ("seller_id")`);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "order_id"         BIGSERIAL     NOT NULL,
        "item_id"          bigint        NOT NULL,
        "buyer_id"         varchar(50)   NOT NULL,
        "seller_id"        varchar(50)   NOT NULL,
        "quantity"         integer       NOT NULL DEFAULT 1,
        "total_amount"     numeric(12,2) NOT NULL,
        "status"           varchar(20)   NOT NULL DEFAULT 'PENDING',
        "payment_slip_url" text,
        "created_at"       timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("order_id"),
        CONSTRAINT "CHK_orders_status" CHECK ("status" IN ('PENDING', 'COMPLETED', 'CANCELLED')),
        CONSTRAINT "CHK_orders_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_orders_total_amount" CHECK ("total_amount" >= 0),
        CONSTRAINT "CHK_orders_buyer_not_seller" CHECK ("buyer_id" <> "seller_id"),
        CONSTRAINT "FK_orders_item" FOREIGN KEY ("item_id")
          REFERENCES "items" ("item_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_buyer" FOREIGN KEY ("buyer_id")
          REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_seller" FOREIGN KEY ("seller_id")
          REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_item" ON "orders" ("item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_buyer_created" ON "orders" ("buyer_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_seller_created" ON "orders" ("seller_id", "created_at")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_orders_item_pending" ON "orders" ("item_id") WHERE "status" = 'PENDING'`,
    );

    await queryRunner.query(`
      CREATE TABLE "messages" (
        "message_id"   BIGSERIAL   NOT NULL,
        "item_id"      bigint      NOT NULL,
        "sender_id"    varchar(50) NOT NULL,
        "receiver_id"  varchar(50) NOT NULL,
        "message_text" text        NOT NULL,
        "is_read"      boolean     NOT NULL DEFAULT false,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("message_id"),
        CONSTRAINT "FK_messages_item" FOREIGN KEY ("item_id")
          REFERENCES "items" ("item_id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_messages_sender" FOREIGN KEY ("sender_id")
          REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_messages_receiver" FOREIGN KEY ("receiver_id")
          REFERENCES "users" ("user_id") ON DELETE RESTRICT ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_messages_conversation" ON "messages" ("item_id", "sender_id", "receiver_id", "created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_messages_sender" ON "messages" ("sender_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_messages_receiver" ON "messages" ("receiver_id")`);

    // Supabase exposes the public schema through its REST API (PostgREST). Enabling RLS without
    // policies blocks anon/authenticated API keys; this backend connects as the table owner and
    // is unaffected.
    for (const table of ['users', 'items', 'orders', 'messages']) {
      await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
