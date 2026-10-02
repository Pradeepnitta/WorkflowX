import { withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function createForAdmin({ email, organizationId, role = 'MEMBER', tokenHash, expiresAt, userId }) {
    return withTransaction(async (client) => {
        const memRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, userId]
        )
        const membership = memRes.rows[0]
        if (!membership || (membership.role !== 'ADMIN' && membership.role !== 'MANAGER')) {
            const error = new Error('Organization admin or manager permission required')
            error.statusCode = 403
            throw error
        }

        const id = randomUUID()
        const now = new Date()
        const res = await client.query(
            `INSERT INTO "Invitation" (id, email, "organizationId", role, "tokenHash", "expiresAt", status, "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [id, email, organizationId, role, tokenHash, expiresAt, 'PENDING', now]
        )

        // Automatically create or link the member in OrganizationMember so they immediately reflect in organization and projects
        try {
            const cleanEmail = email.trim().toLowerCase()
            const userRes = await client.query(`SELECT id FROM "User" WHERE LOWER(email) = $1 LIMIT 1`, [cleanEmail])
            let memberUserId = null
            if (userRes.rows.length > 0) {
                memberUserId = userRes.rows[0].id
            } else {
                memberUserId = randomUUID()
                const name = cleanEmail.split('@')[0]
                await client.query(
                    `INSERT INTO "User" (id, name, email, "passwordHash", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [memberUserId, name, cleanEmail, 'INVITED_MEMBER', now, now]
                )
            }
            await client.query(
                `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = EXCLUDED.role`,
                [organizationId, memberUserId, role, now]
            )
        } catch (err) {
            console.warn('[Invitation] Could not auto-link OrganizationMember:', err.message)
        }

        return res.rows[0]
    })
}
