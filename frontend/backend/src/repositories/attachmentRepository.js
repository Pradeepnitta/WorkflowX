import { query } from '../config/db.js'
import { randomUUID } from 'node:crypto'

export async function createAttachment(data) {
    const id = data.id || randomUUID()
    const now = new Date()
    const res = await query(
        `INSERT INTO "Attachment" (id, "fileName", "storageKey", "fileUrl", "fileType", "fileSize", "taskId", "uploadedById", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [id, data.fileName, data.storageKey, data.fileUrl || null, data.fileType, data.fileSize, data.taskId, data.uploadedById, data.createdAt || now]
    )
    const attachment = res.rows[0]
    const userRes = await query(
        `SELECT id, name, email, "avatarUrl" FROM "User" WHERE id = $1`,
        [attachment.uploadedById]
    )
    attachment.uploadedBy = userRes.rows[0] || null
    return attachment
}

export async function findAttachmentsByTask(taskId) {
    const res = await query(
        `SELECT a.*,
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl"
         FROM "Attachment" a
         LEFT JOIN "User" u ON a."uploadedById" = u.id
         WHERE a."taskId" = $1
         ORDER BY a."createdAt" DESC`,
        [taskId]
    )
    return res.rows.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        storageKey: r.storageKey,
        fileUrl: r.fileUrl,
        fileType: r.fileType,
        fileSize: r.fileSize,
        taskId: r.taskId,
        uploadedById: r.uploadedById,
        createdAt: r.createdAt,
        uploadedBy: r.u_id
            ? {
                id: r.u_id,
                name: r.u_name,
                email: r.u_email,
                avatarUrl: r.u_avatarUrl,
            }
            : null,
    }))
}

export async function findAttachmentById(id) {
    const res = await query(
        `SELECT a.*,
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl"
         FROM "Attachment" a
         LEFT JOIN "User" u ON a."uploadedById" = u.id
         WHERE a.id = $1
         LIMIT 1`,
        [id]
    )
    if (res.rows.length === 0) return null
    const r = res.rows[0]
    return {
        id: r.id,
        fileName: r.fileName,
        storageKey: r.storageKey,
        fileUrl: r.fileUrl,
        fileType: r.fileType,
        fileSize: r.fileSize,
        taskId: r.taskId,
        uploadedById: r.uploadedById,
        createdAt: r.createdAt,
        uploadedBy: r.u_id
            ? {
                id: r.u_id,
                name: r.u_name,
                email: r.u_email,
                avatarUrl: r.u_avatarUrl,
            }
            : null,
    }
}

export async function deleteAttachment(id) {
    const res = await query(`DELETE FROM "Attachment" WHERE id = $1 RETURNING *`, [id])
    return res.rows[0] || null
}
