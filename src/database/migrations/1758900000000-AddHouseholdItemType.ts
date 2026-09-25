import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHouseholdItemType1758900000000 implements MigrationInterface {
  name = 'AddHouseholdItemType1758900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "CHK_items_item_type"`);
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "CHK_items_item_type" CHECK ("item_type" IN ('SECOND_HAND', 'FOOD', 'FREE', 'HOUSEHOLD'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "items" DROP CONSTRAINT "CHK_items_item_type"`);
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "CHK_items_item_type" CHECK ("item_type" IN ('SECOND_HAND', 'FOOD', 'FREE'))`,
    );
  }
}
