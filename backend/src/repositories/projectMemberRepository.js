import { query, withTransaction } from '../config/db.js'

function permissionError() {
    const error = new Error('Project membership permission required')
    error.statusCode = 403
    return error
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getProjectForManager(client, projectId, userId) {
    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }

    const memRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const membership = memRes.rows[0]
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()
    return project
}

export async function addMember({ projectId, userId, memberUserId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { projectId, userId: memberUserId, joinedAt: new Date().toISOString() }
    }
    return withTransaction(async (client) => {
        const project = await getProjectForManager(client, projectId, userId)
        const targetMemRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [project.organizationId, memberUserId]
        )
        if (targetMemRes.rows.length === 0) {
            const error = new Error('User must belong to the organization')
            error.statusCode = 400
            throw error
        }

        const now = new Date()
        const res = await client.query(
            `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
             VALUES ($1, $2, $3)
             ON CONFLICT ("projectId", "userId") DO NOTHING
             RETURNING *`,
            [projectId, memberUserId, now]
        )
        return res.rows[0] || { projectId, userId: memberUserId, joinedAt: now }
    })
}

export async function removeMember({ projectId, userId, memberUserId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { projectId, userId: memberUserId }
    }
    return withTransaction(async (client) => {
        await getProjectForManager(client, projectId, userId)
        const res = await client.query(
            `DELETE FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2 RETURNING *`,
            [projectId, memberUserId]
        )
        return res.rows[0] || { projectId, userId: memberUserId }
    })
}

export async function findForMember({ projectId, userId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return []
    }
    const projectRes = await query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }

    const memRes = await query(
        `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
    )
    if (memRes.rows.length === 0) throw permissionError()

    const membersRes = await query(
        `SELECT pm."projectId", pm."userId", pm."joinedAt",
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl",
                u."createdAt" as "u_createdAt", u."updatedAt" as "u_updatedAt"
         FROM "ProjectMember" pm
         JOIN "User" u ON pm."userId" = u.id
         WHERE pm."projectId" = $1
         ORDER BY pm."joinedAt" ASC`,
        [projectId]
    )
    return membersRes.rows.map((r) => ({
        projectId: r.projectId,
        userId: r.userId,
        joinedAt: r.joinedAt,
        user: {
            id: r.u_id,
            name: r.u_name,
            email: r.u_email,
            avatarUrl: r.u_avatarUrl,
            createdAt: r.u_createdAt,
            updatedAt: r.u_updatedAt,
        },
    }))
}
