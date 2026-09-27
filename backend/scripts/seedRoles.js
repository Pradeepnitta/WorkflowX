import { hashPassword } from '../src/utils/password.js'
import { pool, query } from '../src/config/db.js'
import { randomUUID } from 'node:crypto'

async function run() {
    try {
        const passwordHash = await hashPassword('password123')

        // 1. Create or get default Organization
        let orgRes = await query(`SELECT * FROM "Organization" WHERE name = $1 LIMIT 1`, ['WorkFlowX Enterprise'])
        let org = orgRes.rows[0]

        if (!org) {
            orgRes = await query(`SELECT * FROM "Organization" LIMIT 1`)
            org = orgRes.rows[0]
        }

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
        console.log('Target Organization:', org.name, org.id)

        // 2. Define standard role accounts
        const roleAccounts = [
            { email: 'admin@workflowx.dev', name: 'Pradeep Admin', role: 'ADMIN' },
            { email: 'rahul@workflowx.dev', name: 'Rahul Sharma', role: 'MANAGER' },
            { email: 'pradeep@workflowx.dev', name: 'Pradeep Kumar', role: 'MEMBER' },
            { email: 'sneha@workflowx.dev', name: 'Sneha Patel', role: 'VIEWER' },
        ]

        for (const acc of roleAccounts) {
            const now = new Date()
            const userRes = await query(
                `INSERT INTO "User" (id, name, email, "passwordHash", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", name = EXCLUDED.name, "updatedAt" = EXCLUDED."updatedAt"
                 RETURNING *`,
                [randomUUID(), acc.name, acc.email, passwordHash, now, now]
            )
            const user = userRes.rows[0]

            await query(
                `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = EXCLUDED.role`,
                [org.id, user.id, acc.role, now]
            )

            console.log(`Configured: ${acc.email} -> Role: ${acc.role}`)
        }

        console.log('All role accounts configured successfully with password123!')
    } finally {
        await pool.end()
    }
    process.exit(0)
}

run().catch((err) => {
    console.error('Seeding error:', err)
    process.exit(1)
})
