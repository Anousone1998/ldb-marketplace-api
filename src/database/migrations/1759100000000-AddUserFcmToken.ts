import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserFcmToken1759100000000 implements MigrationInterface {
  name = 'AddUserFcmToken1759100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "fcm_token" text`);
    // One device token belongs to one employee: whoever signed in on the device last.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_fcm_token" ON "users" ("fcm_token")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_fcm_token"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "fcm_token"`);
  }
}
