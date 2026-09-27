import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

function accessError() {
    const error = new Error('Project membership required')
    error.statusCode = 403
    return error
}

async function getTaskAccess(client, taskId, userId) {
    const taskRes = await client.query(`SELECT * FROM "Task" WHERE id = $1`, [taskId])
    const task = taskRes.rows[0]
    if (!task) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }

    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [task.projectId])
    const project = projectRes.rows[0]

    const orgMemRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const organizationMembership = orgMemRes.rows[0]

    const projMemRes = await client.query(
        `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [task.projectId, userId]
    )
    const projectMembership = projMemRes.rows[0]

    if (!organizationMembership || (!projectMembership && project.visibility === 'MEMBERS_ONLY')) {
        throw accessError()
    }
    return task
}

export async function createForTask({ taskId, userId, content, parentId }) {
    return withTransaction(async (client) => {
        const task = await getTaskAccess(client, taskId, userId)
        if (parentId) {
            const parentRes = await client.query(`SELECT * FROM "Comment" WHERE id = $1`, [parentId])
            const parent = parentRes.rows[0]
            if (!parent || parent.taskId !== task.id) {
                const error = new Error('Comment reply must belong to the same task')
                error.statusCode = 400
                throw error
            }
        }

        const id = randomUUID()
        const now = new Date()
        const commentRes = await client.query(
            `INSERT INTO "Comment" (id, content, "taskId", "authorId", "parentId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [id, content, taskId, userId, parentId || null, now, now]
        )
        const comment = commentRes.rows[0]

        const userRes = await client.query(`SELECT * FROM "User" WHERE id = $1`, [userId])
        comment.author = userRes.rows[0]
        return comment
    })
}

export async function findForTask({ taskId, userId }) {
    await getTaskAccess({ query }, taskId, userId)
    const res = await query(
        `SELECT c.*,
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl",
                u."createdAt" as "u_createdAt", u."updatedAt" as "u_updatedAt"
         FROM "Comment" c
         JOIN "User" u ON c."authorId" = u.id
         WHERE c."taskId" = $1
         ORDER BY c."createdAt" ASC`,
        [taskId]
    )
    return res.rows.map((r) => ({
        id: r.id,
        content: r.content,
        taskId: r.taskId,
        authorId: r.authorId,
        parentId: r.parentId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        author: {
            id: r.u_id,
            name: r.u_name,
            email: r.u_email,
            avatarUrl: r.u_avatarUrl,
            createdAt: r.u_createdAt,
            updatedAt: r.u_updatedAt,
        },
    }))
}

async function getOwnedComment(client, commentId, userId) {
    const commentRes = await client.query(`SELECT * FROM "Comment" WHERE id = $1`, [commentId])
    const comment = commentRes.rows[0]
    if (!comment) {
        const error = new Error('Comment not found')
        error.statusCode = 404
        throw error
    }
    await getTaskAccess(client, comment.taskId, userId)
    if (comment.authorId !== userId) {
        const error = new Error('Only the comment author can modify it')
        error.statusCode = 403
        throw error
    }
    return comment
}

export async function update({ commentId, userId, content }) {
    return withTransaction(async (client) => {
        await getOwnedComment(client, commentId, userId)
        const now = new Date()
        const res = await client.query(
            `UPDATE "Comment" SET content = $2, "updatedAt" = $3 WHERE id = $1 RETURNING *`,
            [commentId, content, now]
        )
        const comment = res.rows[0]
        const userRes = await client.query(`SELECT * FROM "User" WHERE id = $1`, [userId])
        comment.author = userRes.rows[0]
        return comment
    })
}

export async function remove({ commentId, userId }) {
    return withTransaction(async (client) => {
        await getOwnedComment(client, commentId, userId)
        const res = await client.query(`DELETE FROM "Comment" WHERE id = $1 RETURNING *`, [commentId])
        return res.rows[0]
    })
}
