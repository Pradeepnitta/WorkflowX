import { query } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function create(data) {
    const id = data.id || randomUUID()
    const now = new Date()
    const res = await query(
        `INSERT INTO "RefreshToken" (id, "tokenHash", "userId", "expiresAt", "revokedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, data.tokenHash, data.userId, data.expiresAt, data.revokedAt || null, data.createdAt || now]
    )
    return res.rows[0]
}

export async function findActiveByHash(tokenHash) {
    const res = await query(
        `SELECT rt.*,
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl",
                u."createdAt" as "u_createdAt", u."updatedAt" as "u_updatedAt"
         FROM "RefreshToken" rt
         JOIN "User" u ON rt."userId" = u.id
         WHERE rt."tokenHash" = $1 AND rt."revokedAt" IS NULL AND rt."expiresAt" > $2
         LIMIT 1`,
        [tokenHash, new Date()]
    )
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    return {
        id: row.id,
        tokenHash: row.tokenHash,
        userId: row.userId,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        createdAt: row.createdAt,
        user: {
            id: row.u_id,
            name: row.u_name,
            email: row.u_email,
            avatarUrl: row.u_avatarUrl,
            createdAt: row.u_createdAt,
            updatedAt: row.u_updatedAt,
        },
    }
}

export async function revoke(id) {
    const res = await query(
        `UPDATE "RefreshToken" SET "revokedAt" = $2 WHERE id = $1 RETURNING *`,
        [id, new Date()]
    )
    return res.rows[0]
}
