import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1755404400695 implements MigrationInterface {
  name = 'Migration1755404400695';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "fk_user_id"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "status" "public"."tasks_status_enum" NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "priority"`);
    await queryRunner.query(
      `CREATE TYPE "public"."tasks_priority_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH')`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "priority" "public"."tasks_priority_enum" NOT NULL DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_707cfc415c7c12d38dfc2ec8eb" ON "tasks" ("due_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_db55af84c226af9dce09487b61" ON "tasks" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "FK_db55af84c226af9dce09487b61b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tasks" DROP CONSTRAINT "FK_db55af84c226af9dce09487b61b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_db55af84c226af9dce09487b61"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_707cfc415c7c12d38dfc2ec8eb"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "role" character varying NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "priority"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_priority_enum"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "priority" character varying NOT NULL DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."tasks_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "status" character varying NOT NULL DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD CONSTRAINT "fk_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
