import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

function accessError() {
    const error = new Error('Project membership required')
    error.statusCode = 403
    return error
}

async function getProjectAccess(client, projectId, userId) {
    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }

    const orgMemRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const organizationMembership = orgMemRes.rows[0]

    const projMemRes = await client.query(
        `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
    )
    const projectMembership = projMemRes.rows[0]

    if (!organizationMembership || (!projectMembership && project.visibility === 'MEMBERS_ONLY')) {
        throw accessError()
    }
    return { project, organizationMembership, projectMembership }
}

export async function createForProject({ projectId, userId, title, description, status = 'TODO', priority = 'MEDIUM', assigneeId, dueDate }) {
    return withTransaction(async (client) => {
        const { organizationMembership } = await getProjectAccess(client, projectId, userId)
        if (assigneeId) {
            const isManagerOrAdmin = organizationMembership && ['ADMIN', 'MANAGER'].includes(organizationMembership.role)
            if (!isManagerOrAdmin) {
                const error = new Error('Only Managers and Admins are permitted to assign tasks')
                error.statusCode = 403
                throw error
            }
            const assigneeRes = await client.query(
                `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
                [projectId, assigneeId]
            )
            if (assigneeRes.rows.length === 0) {
                const error = new Error('Assignee must belong to the project')
                error.statusCode = 400
                throw error
            }
        }

        const id = randomUUID()
        const now = new Date()
        const res = await client.query(
            `INSERT INTO "Task" (id, title, description, "projectId", "createdById", "assigneeId", status, priority, "dueDate", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [id, title, description || null, projectId, userId, assigneeId || null, status, priority, dueDate || null, now, now]
        )
        return res.rows[0]
    })
}

export async function findForProject({ projectId, userId }) {
    await getProjectAccess({ query }, projectId, userId)
    const res = await query(
        `SELECT * FROM "Task" WHERE "projectId" = $1 ORDER BY "createdAt" ASC`,
        [projectId]
    )
    return res.rows
}

export async function updateForMember({ taskId, userId, changes }) {
    return withTransaction(async (client) => {
        const taskRes = await client.query(`SELECT * FROM "Task" WHERE id = $1`, [taskId])
        const task = taskRes.rows[0]
        if (!task) {
            const error = new Error('Task not found')
            error.statusCode = 404
            throw error
        }

        const { organizationMembership } = await getProjectAccess(client, task.projectId, userId)

        if (changes.assigneeId !== undefined && changes.assigneeId !== task.assigneeId) {
            const isManagerOrAdmin = organizationMembership && ['ADMIN', 'MANAGER'].includes(organizationMembership.role)
            if (!isManagerOrAdmin) {
                const error = new Error('Only Managers and Admins are permitted to assign or reassign tasks')
                error.statusCode = 403
                throw error
            }
            if (changes.assigneeId) {
                const assigneeRes = await client.query(
                    `SELECT * FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
                    [task.projectId, changes.assigneeId]
                )
                if (assigneeRes.rows.length === 0) {
                    const error = new Error('Assignee must belong to the project')
                    error.statusCode = 400
                    throw error
                }
            }
        }

        const fields = []
        const values = [taskId]
        let idx = 2

        for (const [key, val] of Object.entries(changes)) {
            fields.push(`"${key}" = $${idx++}`)
            values.push(val)
        }
        fields.push(`"updatedAt" = $${idx++}`)
        values.push(new Date())

        const updateRes = await client.query(
            `UPDATE "Task" SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
            values
        )
        return updateRes.rows[0]
    })
}
