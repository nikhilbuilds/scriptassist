import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexes1710752500000 implements MigrationInterface {
  name = 'AddIndexes1710752500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add version column to users table for optimistic locking
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    // Add version column to tasks table for optimistic locking
    await queryRunner.query(`
      ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    // Create indexes on users table
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")
    `);

    // Create single-column indexes on tasks table
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_id" ON "tasks" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks" ("priority")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks" ("due_date")
    `);

    // Create composite indexes on tasks table for common query patterns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_status" ON "tasks" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_priority" ON "tasks" ("user_id", "priority")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_created" ON "tasks" ("user_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes from tasks table
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_due_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_id"`);

    // Drop indexes from users table
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_role"`);

    // Drop version columns
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN IF EXISTS "version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "version"`);
  }
}
