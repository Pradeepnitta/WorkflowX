import { query } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function findByEmail(email) {
    const res = await query(`SELECT * FROM "User" WHERE email = $1 LIMIT 1`, [email])
    if (res.rows.length === 0) return null
    const user = res.rows[0]
    const memRes = await query(`SELECT * FROM "OrganizationMember" WHERE "userId" = $1`, [user.id])
    user.memberships = memRes.rows
    return user
}

export async function createUser(data) {
    const id = data.id || randomUUID()
    const now = new Date()
    const res = await query(
        `INSERT INTO "User" (id, name, email, "passwordHash", "avatarUrl", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [id, data.name, data.email, data.passwordHash, data.avatarUrl || null, data.createdAt || now, data.updatedAt || now]
    )
    return res.rows[0]
}

export const create = createUser

export async function updateProfile({ userId, name, avatarUrl }) {
    const now = new Date()
    const res = await query(
        `UPDATE "User"
         SET name = COALESCE($2, name), "avatarUrl" = COALESCE($3, "avatarUrl"), "updatedAt" = $4
         WHERE id = $1
         RETURNING *`,
        [userId, name, avatarUrl, now]
    )
    return res.rows[0]
}
