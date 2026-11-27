import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const updateableFields = new Set([
    'name',
    'key',
    'description',
    'status',
    'visibility',
    'priority',
    'startDate',
    'dueDate',
    'teamId',
])

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function requireUuid(value, label) {
    if (!uuidRegex.test(value || '')) throw serviceError(`${label} must be a valid ID`, 400)
}

async function organizationMembership(client, organizationId, userId) {
    const res = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    return res.rows[0] || null
}

async function assertTeamAssignment(client, teamId, organizationId, userId, role) {
    if (!teamId) return
    const teamRes = await client.query(`SELECT * FROM "Team" WHERE id = $1`, [teamId])
    const team = teamRes.rows[0]
    if (!team || team.organizationId !== organizationId) {
        throw serviceError('Team not found in this organization', 404)
    }
    if (role === 'ADMIN') return

    const memberRes = await client.query(
        `SELECT 1 FROM "TeamMember" WHERE "teamId" = $1 AND "userId" = $2`,
        [teamId, userId]
    )
    if (team.createdById !== userId && memberRes.rows.length === 0) {
        throw serviceError('Team management permission required', 403)
    }
}

async function getManageableProject(client, projectId, userId) {
    requireUuid(projectId, 'Project ID')
    requireUuid(userId, 'User ID')
    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) throw serviceError('Project not found', 404)

    const membership = await organizationMembership(client, project.organizationId, userId)
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) {
        throw serviceError('Project management permission required', 403)
    }
    if (membership.role === 'ADMIN') return { project, membership }

    const projectMemberRes = await client.query(
        `SELECT 1 FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
    )
    if (project.createdById !== userId && projectMemberRes.rows.length === 0) {
        throw serviceError('Project management permission required', 403)
    }
    return { project, membership }
}

export async function createForMember({
    name,
    key,
    description,
    organizationId,
    userId,
    status = 'PLANNING',
    visibility = 'ORGANIZATION',
    priority = 'MEDIUM',
    startDate,
    dueDate,
    teamId,
}) {
    requireUuid(organizationId, 'Organization ID')
    requireUuid(userId, 'User ID')
    return withTransaction(async (client) => {
        const membership = await organizationMembership(client, organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) {
            throw serviceError('Project management permission required', 403)
        }
        await assertTeamAssignment(client, teamId, organizationId, userId, membership.role)

        const id = randomUUID()
        const now = new Date()
        const projectKey = (typeof key === 'string' && key.trim().length > 0)
            ? key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
            : ((name || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'PROJ')

        const projectRes = await client.query(
            `INSERT INTO "Project" (
                id, name, "key", description, "organizationId", "createdById", status,
                visibility, priority, "startDate", "dueDate", "teamId", "createdAt", "updatedAt"
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [id, name, projectKey, description || null, organizationId, userId, status, visibility, priority, startDate || null, dueDate || null, teamId || null, now, now]
        )
        const project = projectRes.rows[0]

        await client.query(
            `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
             VALUES ($1, $2, $3)`,
            [project.id, userId, now]
        )
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, 'PROJECT_CREATED', 'PROJECT', $3, 'SUCCESS', $4::jsonb, $5)`,
            [randomUUID(), userId, project.id, JSON.stringify({ organizationId, name, status }), now]
        )
        return project
    })
}

export async function findForMember({ organizationId, userId }) {
    requireUuid(organizationId, 'Organization ID')
    requireUuid(userId, 'User ID')
    const membership = await organizationMembership({ query }, organizationId, userId)
    if (!membership) throw serviceError('Organization membership required', 403)

    const res = await query(
        `SELECT p.*,
                (SELECT COUNT(*)::int FROM "Task" task WHERE task."projectId" = p.id) AS "taskTotal",
                (SELECT COUNT(*)::int FROM "Task" task WHERE task."projectId" = p.id AND task.status = 'COMPLETED') AS "taskCompleted",
                (SELECT COUNT(*)::int FROM "Task" task WHERE task."projectId" = p.id AND task.status = 'IN_PROGRESS') AS "taskInProgress",
                (SELECT COUNT(*)::int FROM "Task" task WHERE task."projectId" = p.id AND task.status = 'IN_REVIEW') AS "taskReview",
                (SELECT COUNT(*)::int FROM "Task" task WHERE task."projectId" = p.id AND task.status = 'TODO') AS "taskTodo",
                (
                    $2 = 'ADMIN'
                    OR (
                        $2 = 'MANAGER'
                        AND (
                            p."createdById" = $3
                            OR EXISTS (
                                SELECT 1 FROM "ProjectMember" pm
                                WHERE pm."projectId" = p.id AND pm."userId" = $3
                            )
                        )
                    )
                ) AS "canManage",
                EXISTS (
                    SELECT 1 FROM "ProjectMember" pm
                    WHERE pm."projectId" = p.id AND pm."userId" = $3
                ) AS "isMember"
         FROM "Project" p
         WHERE p."organizationId" = $1
           AND (
                p.visibility <> 'MEMBERS_ONLY'
                OR $2 = 'ADMIN'
                OR EXISTS (
                    SELECT 1 FROM "ProjectMember" pm
                    WHERE pm."projectId" = p.id AND pm."userId" = $3
                )
           )
         ORDER BY p."createdAt" ASC`,
        [organizationId, membership.role, userId]
    )
    return res.rows
}

export async function updateForManager({ projectId, userId, changes }) {
    return withTransaction(async (client) => {
        const { project, membership } = await getManageableProject(client, projectId, userId)
        const safeChanges = Object.entries(changes).filter(([field]) => updateableFields.has(field))
        if (safeChanges.length === 0) throw serviceError('At least one valid project field is required', 400)

        const nextStartDate = changes.startDate === undefined ? project.startDate : changes.startDate
        const nextDueDate = changes.dueDate === undefined ? project.dueDate : changes.dueDate
        if (nextStartDate && nextDueDate && new Date(nextDueDate) < new Date(nextStartDate)) {
            throw serviceError('Deadline cannot be earlier than the start date', 400)
        }
        if (changes.teamId !== undefined) {
            await assertTeamAssignment(client, changes.teamId, project.organizationId, userId, membership.role)
        }

        const fields = []
        const values = [projectId]
        let idx = 2
        for (const [field, value] of safeChanges) {
            fields.push(`"${field}" = $${idx++}`)
            values.push(value)
        }
        fields.push(`"updatedAt" = $${idx++}`)
        values.push(new Date())

        const updateRes = await client.query(
            `UPDATE "Project" SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
            values
        )
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, $3, 'PROJECT', $4, 'SUCCESS', $5::jsonb, $6)`,
            [
                randomUUID(),
                userId,
                changes.status === 'ARCHIVED' ? 'PROJECT_ARCHIVED' : 'PROJECT_UPDATED',
                projectId,
                JSON.stringify({ organizationId: project.organizationId, changedFields: safeChanges.map(([f]) => f) }),
                new Date(),
            ]
        )
        return updateRes.rows[0]
    })
}

export async function deleteForManager({ projectId, userId }) {
    return withTransaction(async (client) => {
        const { project } = await getManageableProject(client, projectId, userId)
        await client.query(`DELETE FROM "ProjectMember" WHERE "projectId" = $1`, [projectId])
        await client.query(`DELETE FROM "Project" WHERE id = $1`, [projectId])
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, 'PROJECT_DELETED', 'PROJECT', $3, 'SUCCESS', $4::jsonb, $5)`,
            [randomUUID(), userId, projectId, JSON.stringify({ organizationId: project.organizationId, name: project.name }), new Date()]
        )
        return project
    })
}
