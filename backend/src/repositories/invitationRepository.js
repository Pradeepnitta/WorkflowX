import { withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function createForAdmin({ email, organizationId, role = 'MEMBER', tokenHash, expiresAt, userId }) {
    return withTransaction(async (client) => {
        const memRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, userId]
        )
        const membership = memRes.rows[0]
        if (!membership || membership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
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
        return res.rows[0]
    })
}
