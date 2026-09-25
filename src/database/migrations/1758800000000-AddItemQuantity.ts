import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemQuantity1758800000000 implements MigrationInterface {
  name = 'AddItemQuantity1758800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" ADD "quantity" integer NOT NULL DEFAULT 1`);
    await queryRunner.query(`UPDATE "items" SET "quantity" = 0 WHERE "status" = 'SOLD'`);
    await queryRunner.query(`ALTER TABLE "items" ADD CONSTRAINT "CHK_items_quantity" CHECK ("quantity" >= 0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "CHK_items_quantity"`);
    await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "quantity"`);
  }
}
