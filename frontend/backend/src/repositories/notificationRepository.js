import { query } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function createNotification({ userId, type, message }) {
    const id = randomUUID()
    const now = new Date()
    const res = await query(
        `INSERT INTO "Notification" (id, "userId", type, message, "isRead", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, userId, type, message, false, now]
    )
    return res.rows[0]
}

export async function findForUser(userId) {
    const res = await query(
        `SELECT * FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
        [userId]
    )
    return res.rows
}

export async function markRead({ notificationId, userId }) {
    const res = await query(
        `UPDATE "Notification" SET "isRead" = true WHERE id = $1 AND "userId" = $2`,
        [notificationId, userId]
    )
    return { count: res.rowCount }
}
