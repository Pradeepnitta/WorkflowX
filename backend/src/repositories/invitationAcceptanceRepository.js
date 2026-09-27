import { withTransaction } from '../config/db.js'
import { hashRefreshToken } from '../utils/refreshToken.js'

export async function accept({ token, userId }) {
    return withTransaction(async (client) => {
        const tokenHash = hashRefreshToken(token)
        const invRes = await client.query(
            `SELECT * FROM "Invitation" WHERE "tokenHash" = $1 LIMIT 1`,
            [tokenHash]
        )
        const invitation = invRes.rows[0]
        if (!invitation || invitation.status !== 'PENDING' || new Date(invitation.expiresAt) <= new Date()) {
            const error = new Error('Invalid or expired invitation')
            error.statusCode = 400
            throw error
        }

        const userRes = await client.query(`SELECT * FROM "User" WHERE id = $1`, [userId])
        const user = userRes.rows[0]
        if (!user || user.email !== invitation.email) {
            const error = new Error('Invitation email does not match the authenticated user')
            error.statusCode = 403
            throw error
        }

        const now = new Date()
        await client.query(
            `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT ("organizationId", "userId") DO UPDATE SET role = EXCLUDED.role`,
            [invitation.organizationId, userId, invitation.role, now]
        )

        const updateRes = await client.query(
            `UPDATE "Invitation" SET status = 'ACCEPTED' WHERE id = $1 RETURNING *`,
            [invitation.id]
        )
        return updateRes.rows[0]
    })
}
