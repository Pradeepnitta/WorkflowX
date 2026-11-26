import { query, withTransaction } from '../config/db.js'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

async function getProjectForManager(client, projectId, userId) {
    if (!uuidRegex.test(projectId || '') || !uuidRegex.test(userId || '')) {
        throw serviceError('Project and user IDs must be valid', 400)
    }
    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) {
        throw serviceError('Project not found', 404)
    }

    const memRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const membership = memRes.rows[0]
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) {
        throw serviceError('Project management permission required', 403)
    }
    if (membership.role === 'MANAGER' && project.createdById !== userId) {
        const projectMemberRes = await client.query(
            `SELECT 1 FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
            [projectId, userId]
        )
        if (projectMemberRes.rows.length === 0) {
            throw serviceError('Project management permission required', 403)
        }
    }
    return project
}

export async function addMember({ projectId, userId, memberUserId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        throw serviceError('Project and user IDs must be valid', 400)
    }
    return withTransaction(async (client) => {
        const project = await getProjectForManager(client, projectId, userId)
        const targetMemRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [project.organizationId, memberUserId]
        )
        if (targetMemRes.rows.length === 0) {
            throw serviceError('User must belong to the organization', 400)
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
        throw serviceError('Project and user IDs must be valid', 400)
    }
    return withTransaction(async (client) => {
        const project = await getProjectForManager(client, projectId, userId)
        if (project.createdById === memberUserId && project.createdById !== userId) {
            throw serviceError('The project owner cannot be removed by a Manager', 403)
        }
        const res = await client.query(
            `DELETE FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2 RETURNING *`,
            [projectId, memberUserId]
        )
        return res.rows[0] || { projectId, userId: memberUserId }
    })
}

export async function findForMember({ projectId, userId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        throw serviceError('Project and user IDs must be valid', 400)
    }
    const projectRes = await query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) {
        throw serviceError('Project not found', 404)
    }

    const memRes = await query(
        `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
    )
    const orgMemRes = await query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const membership = orgMemRes.rows[0]
    if (!membership || (project.visibility === 'MEMBERS_ONLY' && memRes.rows.length === 0 && membership.role !== 'ADMIN')) {
        throw serviceError('Project membership permission required', 403)
    }

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
