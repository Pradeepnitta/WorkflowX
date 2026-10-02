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

export async function markAllRead(userId) {
    const res = await query(
        `UPDATE "Notification" SET "isRead" = true WHERE "userId" = $1`,
        [userId]
    )
    return { count: res.rowCount }
}

export async function removeNotification({ notificationId, userId }) {
    const res = await query(
        `DELETE FROM "Notification" WHERE id = $1 AND "userId" = $2`,
        [notificationId, userId]
    )
    return { count: res.rowCount }
}

export async function markUnread({ notificationId, userId }) {
    const res = await query(
        `UPDATE "Notification" SET "isRead" = false WHERE id = $1 AND "userId" = $2`,
        [notificationId, userId]
    )
    return { count: res.rowCount }
}

export async function clearAllForUser(userId) {
    const res = await query(
        `DELETE FROM "Notification" WHERE "userId" = $1`,
        [userId]
    )
    return { count: res.rowCount }
}

export async function clearReadForUser(userId) {
    const res = await query(
        `DELETE FROM "Notification" WHERE "userId" = $1 AND "isRead" = true`,
        [userId]
    )
    return { count: res.rowCount }
}
