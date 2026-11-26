import { withTransaction } from '../src/config/db.js'

async function migrate() {
    await withTransaction(async (client) => {
        await client.query(`
            ALTER TABLE "User"
                ADD COLUMN IF NOT EXISTS "systemRole" TEXT NOT NULL DEFAULT 'USER',
                ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
                ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMPTZ
        `)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_systemRole_valid') THEN
                    ALTER TABLE "User"
                        ADD CONSTRAINT "User_systemRole_valid"
                        CHECK ("systemRole" IN ('USER', 'ADMIN'));
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_accountStatus_valid') THEN
                    ALTER TABLE "User"
                        ADD CONSTRAINT "User_accountStatus_valid"
                        CHECK ("accountStatus" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'));
                END IF;
            END;
            $$
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "User_systemRole_status_idx"
            ON "User" ("systemRole", "accountStatus")
        `)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "RefreshToken" (
                id UUID PRIMARY KEY,
                "tokenHash" TEXT NOT NULL UNIQUE,
                "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
                "expiresAt" TIMESTAMPTZ NOT NULL,
                "revokedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "RefreshToken_userId_expiresAt_idx"
            ON "RefreshToken" ("userId", "expiresAt")
        `)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "AuditLog" (
                id UUID PRIMARY KEY,
                "actorUserId" UUID REFERENCES "User"(id) ON DELETE SET NULL,
                action TEXT NOT NULL,
                "resourceType" TEXT NOT NULL,
                "resourceId" TEXT,
                result TEXT NOT NULL DEFAULT 'SUCCESS',
                details JSONB NOT NULL DEFAULT '{}'::jsonb,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"
            ON "AuditLog" ("createdAt" DESC)
        `)
        await client.query(`
            CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_idx"
            ON "AuditLog" ("actorUserId", "createdAt" DESC)
        `)
    })
}

try {
    await migrate()
    console.log('Global Admin migration completed.')
} catch (error) {
    console.error('Global Admin migration failed:', error.message)
    process.exitCode = 1
}
