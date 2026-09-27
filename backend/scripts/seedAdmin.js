import { hashPassword } from '../src/utils/password.js'
import { pool, query } from '../src/config/db.js'
import { randomUUID } from 'node:crypto'

async function run() {
    try {
        const hash = await hashPassword('password123')

        let orgRes = await query(`SELECT * FROM "Organization" WHERE name = $1 LIMIT 1`, ['WorkFlowX Enterprise'])
        let org = orgRes.rows[0]
        if (!org) {
            const orgId = randomUUID()
            const now = new Date()
            const newOrgRes = await query(
                `INSERT INTO "Organization" (id, name, description, "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [orgId, 'WorkFlowX Enterprise', 'Main production workspace for agile project and team execution', now, now]
            )
            org = newOrgRes.rows[0]
        }

        const now = new Date()
        const adminRes = await query(
            `INSERT INTO "User" (id, name, email, "passwordHash", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"
             RETURNING *`,
            [randomUUID(), 'Pradeep Admin', 'admin@workflowx.dev', hash, now, now]
        )
        const admin = adminRes.rows[0]

        await query(
            `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = 'ADMIN'`,
            [org.id, admin.id, 'ADMIN', now]
        )

        console.log('Admin user configured with ADMIN role:', admin.email, org.name)
    } finally {
        await pool.end()
    }
    process.exit(0)
}

run().catch((err) => {
    console.error('Seeding error:', err)
    process.exit(1)
})
