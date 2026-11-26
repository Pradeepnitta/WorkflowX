import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'
import { assertTaskAccess } from './projectTaskRepository.js'

export async function createAttachment(data) {
    const id = data.id || randomUUID()
    const now = new Date()
    return withTransaction(async (client) => {
        await assertTaskAccess(client, data.taskId, data.uploadedById, { write: true })
        const res = await client.query(
            `INSERT INTO "Attachment" (id, "fileName", "storageKey", "fileUrl", "fileType", "fileSize", "taskId", "uploadedById", "createdAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [id, data.fileName, data.storageKey, data.fileUrl || null, data.fileType, data.fileSize, data.taskId, data.uploadedById, data.createdAt || now]
        )
        const attachment = res.rows[0]
        const userRes = await client.query(
            `SELECT id, name, email, "avatarUrl" FROM "User" WHERE id = $1`,
            [attachment.uploadedById]
        )
        attachment.uploadedBy = userRes.rows[0] || null
        return attachment
    })
}

export async function findAttachmentsByTask(taskId, userId) {
    await assertTaskAccess({ query }, taskId, userId)
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

export async function findAttachmentById(id, userId) {
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
    await assertTaskAccess({ query }, r.taskId, userId, { write: true })
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

export async function deleteAttachment(id, userId) {
    return withTransaction(async (client) => {
        const attachmentRes = await client.query(`SELECT * FROM "Attachment" WHERE id = $1 FOR UPDATE`, [id])
        const attachment = attachmentRes.rows[0]
        if (!attachment) return null
        const { organizationMembership } = await assertTaskAccess(client, attachment.taskId, userId, { write: true })
        if (organizationMembership.role === 'MEMBER' && attachment.uploadedById !== userId) {
            const error = new Error('Only the uploader can remove this attachment')
            error.statusCode = 403
            throw error
        }
        const res = await client.query(`DELETE FROM "Attachment" WHERE id = $1 RETURNING *`, [id])
        return res.rows[0] || null
    })
}
