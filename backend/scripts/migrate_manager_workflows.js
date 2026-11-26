import { withTransaction } from '../src/config/db.js'

async function migrate() {
    await withTransaction(async (client) => {
        await client.query(`
            ALTER TABLE "Team"
                ADD COLUMN IF NOT EXISTS "createdById" UUID REFERENCES "User"(id) ON DELETE SET NULL
        `)
        await client.query(`
            ALTER TABLE "Project"
                ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "teamId" UUID REFERENCES "Team"(id) ON DELETE SET NULL
        `)
        await client.query(`
            ALTER TABLE "Task"
                ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS "teamId" UUID REFERENCES "Team"(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ
        `)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'Task_progress_range'
                ) THEN
                    ALTER TABLE "Task"
                        ADD CONSTRAINT "Task_progress_range" CHECK (progress BETWEEN 0 AND 100);
                END IF;
            END;
            $$
        `)
        await client.query(`
            UPDATE "Task"
            SET "completedAt" = "updatedAt"
            WHERE status = 'COMPLETED' AND "completedAt" IS NULL
        `)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "TaskReview" (
                id UUID PRIMARY KEY,
                "taskId" UUID NOT NULL REFERENCES "Task"(id) ON DELETE CASCADE,
                "submittedById" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
                "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "submissionDetails" TEXT,
                status TEXT NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED')),
                "reviewedById" UUID REFERENCES "User"(id) ON DELETE SET NULL,
                "reviewedAt" TIMESTAMPTZ,
                feedback TEXT
            )
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "TaskReview_task_submitted_idx"
            ON "TaskReview" ("taskId", "submittedAt" DESC)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "Team_createdBy_idx" ON "Team" ("createdById")
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "Project_teamId_idx" ON "Project" ("teamId")
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "Task_teamId_idx" ON "Task" ("teamId")
        `)
    })
}

try {
    await migrate()
    console.log('Manager workflow migration completed.')
} catch (error) {
    console.error('Manager workflow migration failed:', error.message)
    process.exitCode = 1
}
