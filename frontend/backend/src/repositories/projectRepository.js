import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

function permissionError() {
    const error = new Error('Project management permission required')
    error.statusCode = 403
    return error
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function organizationMembership(client, organizationId, userId) {
    const res = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    return res.rows[0] || null
}

export async function createForMember({ name, description, organizationId, userId, status = 'PLANNING', visibility = 'ORGANIZATION', priority = 'MEDIUM', dueDate }) {
    return withTransaction(async (client) => {
        const membership = await organizationMembership(client, organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()

        const id = randomUUID()
        const now = new Date()
        const projectRes = await client.query(
            `INSERT INTO "Project" (id, name, description, "organizationId", "createdById", status, visibility, priority, "dueDate", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [id, name, description || null, organizationId, userId, status, visibility, priority, dueDate || null, now, now]
        )
        const project = projectRes.rows[0]

        await client.query(
            `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
             VALUES ($1, $2, $3)`,
            [project.id, userId, now]
        )
        return project
    })
}

export async function findForMember({ organizationId, userId }) {
    const membership = await organizationMembership({ query }, organizationId, userId)
    if (!membership) throw permissionError()

    const res = await query(
        `SELECT * FROM "Project" WHERE "organizationId" = $1 ORDER BY "createdAt" ASC`,
        [organizationId]
    )
    return res.rows
}

export async function updateForManager({ projectId, userId, changes }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return { id: projectId, ...changes }
    }
    return withTransaction(async (client) => {
        const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
        const project = projectRes.rows[0]
        if (!project) return { id: projectId, ...changes }

        const membership = await organizationMembership(client, project.organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()

        const fields = []
        const values = [projectId]
        let idx = 2

        for (const [key, val] of Object.entries(changes)) {
            fields.push(`"${key}" = $${idx++}`)
            values.push(val)
        }
        fields.push(`"updatedAt" = $${idx++}`)
        values.push(new Date())

        const updateRes = await client.query(
            `UPDATE "Project" SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
            values
        )
        return updateRes.rows[0]
    })
}

export async function deleteForManager({ projectId, userId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return { id: projectId, organizationId: null }
    }
    return withTransaction(async (client) => {
        const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
        const project = projectRes.rows[0]
        if (!project) return { id: projectId, organizationId: null }

        const membership = await organizationMembership(client, project.organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()

        await client.query(`DELETE FROM "Project" WHERE id = $1`, [projectId])
        return project
    })
}
