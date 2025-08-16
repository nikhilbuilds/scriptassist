import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1710752401000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1710752401000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add indexes for better query performance
    
    // Index for user authentication (email lookups)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email")
    `);

    // Index for user role-based queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" ("role")
    `);

    // Index for task filtering by user
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_id" ON "tasks" ("user_id")
    `);

    // Index for task status filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_status" ON "tasks" ("status")
    `);

    // Index for task priority filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_priority" ON "tasks" ("priority")
    `);

    // Index for due date queries (important for overdue tasks)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks" ("due_date")
    `);

    // Composite index for common task filtering patterns
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_status" ON "tasks" ("user_id", "status")
    `);

    // Composite index for priority-based queries within user context
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_user_priority" ON "tasks" ("user_id", "priority")
    `);

    // Index for date range queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_created_at" ON "tasks" ("created_at")
    `);

    // Partial index for overdue tasks (only tasks with due_date < now and status != COMPLETED)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tasks_overdue" ON "tasks" ("due_date", "status") 
      WHERE "due_date" < NOW() AND "status" != 'COMPLETED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes in reverse order
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_overdue"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_due_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_priority"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_tasks_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_email"`);
  }
}
