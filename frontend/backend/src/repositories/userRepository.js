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

export async function findById(id) {
    const res = await query(`SELECT * FROM "User" WHERE id = $1 LIMIT 1`, [id])
    if (res.rows.length === 0) return null
    const user = res.rows[0]
    const memRes = await query(`SELECT * FROM "OrganizationMember" WHERE "userId" = $1`, [user.id])
    user.memberships = memRes.rows
    return user
}

export async function updateProfile({ userId, name, avatarUrl, passwordHash }) {
    const now = new Date()
    const fields = ['"updatedAt" = $2']
    const values = [userId, now]
    let idx = 3

    if (name !== undefined) {
        fields.push(`name = $${idx++}`)
        values.push(name)
    }
    if (avatarUrl !== undefined) {
        fields.push(`"avatarUrl" = $${idx++}`)
        values.push(avatarUrl)
    }
    if (passwordHash !== undefined) {
        fields.push(`"passwordHash" = $${idx++}`)
        values.push(passwordHash)
    }

    const res = await query(
        `UPDATE "User"
         SET ${fields.join(', ')}
         WHERE id = $1
         RETURNING *`,
        values
    )
    return res.rows[0]
}
