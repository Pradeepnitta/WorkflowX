import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const updateableFields = new Set([
    'title',
    'description',
    'status',
    'priority',
    'assigneeId',
    'dueDate',
    'startDate',
    'teamId',
    'progress',
])

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function requireUuid(value, label) {
    if (!uuidRegex.test(value || '')) throw serviceError(`${label} must be a valid ID`, 400)
}

async function getProjectAccess(client, projectId, userId) {
    requireUuid(projectId, 'Project ID')
    requireUuid(userId, 'User ID')
    const projectRes = await client.query(`SELECT * FROM "Project" WHERE id = $1`, [projectId])
    const project = projectRes.rows[0]
    if (!project) throw serviceError('Project not found', 404)

    const orgMemRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [project.organizationId, userId]
    )
    const organizationMembership = orgMemRes.rows[0]
    if (!organizationMembership) throw serviceError('Project access denied', 404)

    const projMemRes = await client.query(
        `SELECT 1 FROM "ProjectMember" WHERE "projectId" = $1 AND "userId" = $2`,
        [projectId, userId]
    )
    const projectMembership = projMemRes.rows[0] || null

    if (
        project.visibility === 'MEMBERS_ONLY'
        && !projectMembership
        && organizationMembership.role !== 'ADMIN'
    ) {
        throw serviceError('Project access denied', 404)
    }
    return { project, organizationMembership, projectMembership }
}

export async function assertTaskAccess(client, taskId, userId, { write = false } = {}) {
    const task = await getTaskRow(client, taskId)
    const { project, organizationMembership, projectMembership } = await getProjectAccess(client, task.projectId, userId)
    const role = organizationMembership.role

    if (role === 'ADMIN') return { task, project, organizationMembership }
    if (role === 'MANAGER') {
        assertCanManageProject(project, organizationMembership, projectMembership, userId)
        return { task, project, organizationMembership }
    }
    if (role === 'MEMBER' && task.assigneeId === userId) {
        return { task, project, organizationMembership }
    }
    if (!write && role === 'VIEWER' && projectMembership) {
        return { task, project, organizationMembership }
    }

    throw serviceError('Task not found', 404)
}

function assertCanManageProject(project, organizationMembership, projectMembership, userId) {
    if (organizationMembership.role === 'ADMIN') return
    if (
        organizationMembership.role !== 'MANAGER'
        || (project.createdById !== userId && !projectMembership)
    ) {
        throw serviceError('Project management permission required', 403)
    }
}

async function assertTeamAccess(client, teamId, organizationId, userId, organizationRole) {
    if (!teamId) return
    requireUuid(teamId, 'Team ID')
    const teamRes = await client.query(`SELECT * FROM "Team" WHERE id = $1`, [teamId])
    const team = teamRes.rows[0]
    if (!team || team.organizationId !== organizationId) {
        throw serviceError('Team not found in this organization', 404)
    }
    if (organizationRole === 'ADMIN') return
    const teamMemberRes = await client.query(
        `SELECT 1 FROM "TeamMember" WHERE "teamId" = $1 AND "userId" = $2`,
        [teamId, userId]
    )
    if (team.createdById !== userId && teamMemberRes.rows.length === 0) {
        throw serviceError('Team management permission required', 403)
    }
}

async function insertNotification(client, userId, message, title = 'Task Update') {
    if (!userId) return null
    const result = await client.query(
        `INSERT INTO "Notification" (id, "userId", type, title, message, "isRead", "createdAt")
         VALUES ($1, $2, 'TASK_UPDATED', $3, $4, FALSE, $5)
         RETURNING *`,
        [randomUUID(), userId, title, message, new Date()]
    )
    return result.rows[0]
}

async function getTaskRow(client, taskId, lock = false) {
    requireUuid(taskId, 'Task ID')
    const result = await client.query(
        `SELECT * FROM "Task" WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
        [taskId]
    )
    if (!result.rows[0]) throw serviceError('Task not found', 404)
    return result.rows[0]
}

async function getLatestReview(client, taskId, lock = false) {
    const result = await client.query(
        `SELECT * FROM "TaskReview"
         WHERE "taskId" = $1
         ORDER BY "submittedAt" DESC, id DESC
         LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [taskId]
    )
    return result.rows[0] || null
}

async function getReviewNotifications(client, project, task, message) {
    const managers = await client.query(
        `SELECT DISTINCT om."userId"
         FROM "OrganizationMember" om
         LEFT JOIN "ProjectMember" pm
           ON pm."projectId" = $1 AND pm."userId" = om."userId"
         WHERE om."organizationId" = $2
           AND om.role = 'MANAGER'
           AND (om."userId" = $3 OR pm."userId" IS NOT NULL)`,
        [project.id, project.organizationId, project.createdById]
    )
    const notifications = []
    for (const manager of managers.rows) {
        if (manager.userId === task.assigneeId) continue
        const notification = await insertNotification(client, manager.userId, message)
        if (notification) notifications.push(notification)
    }
    return notifications
}

export async function createForProject({
    projectId,
    userId,
    title,
    description,
    status = 'TODO',
    priority = 'MEDIUM',
    assigneeId,
    dueDate,
    startDate,
    teamId,
    progress = 0,
}) {
    return withTransaction(async (client) => {
        const { project, organizationMembership, projectMembership } = await getProjectAccess(client, projectId, userId)
        assertCanManageProject(project, organizationMembership, projectMembership, userId)
        if (!['TODO', 'IN_PROGRESS'].includes(status)) {
            throw serviceError('New tasks must start as TODO or IN_PROGRESS', 400)
        }
        if (assigneeId) {
            requireUuid(assigneeId, 'Assignee ID')
            const assigneeRes = await client.query(
                `SELECT role FROM "OrganizationMember"
                 WHERE "organizationId" = $1 AND "userId" = $2`,
                [project.organizationId, assigneeId]
            )
            if (assigneeRes.rows[0]?.role !== 'MEMBER') {
                throw serviceError('Assignee must be a Developer in this organization', 400)
            }
            await client.query(
                `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
                 VALUES ($1, $2, $3)
                 ON CONFLICT ("projectId", "userId") DO NOTHING`,
                [projectId, assigneeId, new Date()]
            )
        }
        await assertTeamAccess(client, teamId, project.organizationId, userId, organizationMembership.role)

        const id = randomUUID()
        const now = new Date()
        const result = await client.query(
            `INSERT INTO "Task" (
                id, title, description, "projectId", "creatorId", "createdById", "assigneeId", status,
                priority, "startDate", "dueDate", "teamId", progress, "createdAt", "updatedAt"
             )
             VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING *`,
            [id, title, description || null, projectId, userId, assigneeId || null, status, priority, startDate || null, dueDate || null, teamId || null, progress, now, now]
        )
        return result.rows[0]
    })
}

export async function findForProject({ projectId, userId }) {
    const { project, organizationMembership, projectMembership } = await getProjectAccess({ query }, projectId, userId)
    if (organizationMembership.role === 'MANAGER') {
        assertCanManageProject(project, organizationMembership, projectMembership, userId)
    }
    const result = await query(
        `SELECT t.*,
                review.status AS "reviewStatus",
                review."submittedAt",
                review."submissionDetails",
                review."submittedById",
                submitter.name AS "submitterName",
                review."reviewedById",
                reviewer.name AS "reviewerName",
                review."reviewedAt",
                review.feedback AS "reviewFeedback"
         FROM "Task" t
         LEFT JOIN LATERAL (
             SELECT * FROM "TaskReview" tr
             WHERE tr."taskId" = t.id
             ORDER BY tr."submittedAt" DESC, tr.id DESC
             LIMIT 1
         ) review ON TRUE
         LEFT JOIN "User" submitter ON submitter.id = review."submittedById"
         LEFT JOIN "User" reviewer ON reviewer.id = review."reviewedById"
         WHERE t."projectId" = $1
           AND ($2 <> 'MEMBER' OR t."assigneeId" = $3)
         ORDER BY t."createdAt" ASC`,
        [projectId, organizationMembership.role, userId]
    )
    return result.rows
}

export async function updateForMember({ taskId, userId, changes }) {
    return withTransaction(async (client) => {
        const task = await getTaskRow(client, taskId, true)
        const { project, organizationMembership, projectMembership } = await getProjectAccess(client, task.projectId, userId)
        const safeChanges = Object.entries(changes).filter(([field]) => updateableFields.has(field))
        if (safeChanges.length === 0) throw serviceError('At least one valid task field is required', 400)

        const canManage = organizationMembership.role === 'ADMIN'
            || (
                organizationMembership.role === 'MANAGER'
                && (project.createdById === userId || projectMembership)
            )

        if (!canManage) {
            if (organizationMembership.role !== 'MEMBER' || task.assigneeId !== userId) {
                throw serviceError('Only the assigned Developer or an authorized Manager can update this task', 403)
            }
            if (safeChanges.some(([field]) => !['status', 'progress'].includes(field))) {
                throw serviceError('Developers can only update task status and progress', 403)
            }
            if (task.status === 'IN_REVIEW' || task.status === 'COMPLETED') {
                throw serviceError('This task is locked while it is under review or completed', 403)
            }
            if (changes.status !== undefined && changes.status !== 'IN_PROGRESS') {
                throw serviceError('Developers can only start tasks or keep them in progress', 403)
            }
            if (changes.progress !== undefined && (changes.status || task.status) !== 'IN_PROGRESS') {
                throw serviceError('Start the task before updating its progress', 403)
            }
        } else {
            assertCanManageProject(project, organizationMembership, projectMembership, userId)
        }

        if (changes.status === 'IN_REVIEW') {
            throw serviceError('Submit the task for review using the review workflow', 400)
        }
        if (task.status === 'IN_REVIEW' && changes.status === 'COMPLETED') {
            throw serviceError('A task in review must be approved through the review workflow', 400)
        }

        if (changes.assigneeId) {
            requireUuid(changes.assigneeId, 'Assignee ID')
            const assigneeRes = await client.query(
                `SELECT role FROM "OrganizationMember"
                 WHERE "organizationId" = $1 AND "userId" = $2`,
                [project.organizationId, changes.assigneeId]
            )
            if (assigneeRes.rows[0]?.role !== 'MEMBER') {
                throw serviceError('Assignee must be a Developer in this organization', 400)
            }
            await client.query(
                `INSERT INTO "ProjectMember" ("projectId", "userId", "joinedAt")
                 VALUES ($1, $2, $3)
                 ON CONFLICT ("projectId", "userId") DO NOTHING`,
                [task.projectId, changes.assigneeId, new Date()]
            )
        }
        if (changes.teamId !== undefined) {
            await assertTeamAccess(client, changes.teamId, project.organizationId, userId, organizationMembership.role)
        }

        const fields = []
        const values = [taskId]
        let index = 2
        for (const [field, value] of safeChanges) {
            fields.push(`"${field}" = $${index++}`)
            values.push(value)
        }
        if (changes.status === 'COMPLETED') {
            fields.push(`"completedAt" = $${index++}`)
            values.push(new Date())
            if (changes.progress === undefined) {
                fields.push(`progress = 100`)
            }
        } else if (changes.status && task.status === 'COMPLETED') {
            fields.push(`"completedAt" = NULL`)
        }
        fields.push(`"updatedAt" = $${index++}`)
        values.push(new Date())

        const result = await client.query(
            `UPDATE "Task" SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
            values
        )
        return result.rows[0]
    })
}

export async function deleteForManager({ taskId, userId }) {
    return withTransaction(async (client) => {
        const task = await getTaskRow(client, taskId, true)
        const { project, organizationMembership, projectMembership } = await getProjectAccess(client, task.projectId, userId)
        assertCanManageProject(project, organizationMembership, projectMembership, userId)
        await client.query(`DELETE FROM "Task" WHERE id = $1`, [taskId])
        return {
            id: taskId,
            projectId: task.projectId,
            assigneeId: task.assigneeId,
            createdById: task.createdById,
            deleted: true,
        }
    })
}

export async function submitForReview({ taskId, userId, submissionDetails }) {
    return withTransaction(async (client) => {
        const task = await getTaskRow(client, taskId, true)
        const { project, organizationMembership } = await getProjectAccess(client, task.projectId, userId)
        if (organizationMembership.role !== 'MEMBER' || task.assigneeId !== userId) {
            throw serviceError('Only the assigned Developer can submit this task for review', 403)
        }
        if (task.status !== 'IN_PROGRESS') {
            throw serviceError('Only an in-progress task can be submitted for review', 400)
        }

        const id = randomUUID()
        const submittedAt = new Date()
        await client.query(
            `INSERT INTO "TaskReview" (
                id, "taskId", "submittedById", "submittedAt", "submissionDetails", status
             )
             VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
            [id, taskId, userId, submittedAt, submissionDetails || null]
        )
        const updatedRes = await client.query(
            `UPDATE "Task" SET status = 'IN_REVIEW', progress = 100, "updatedAt" = $2
             WHERE id = $1 RETURNING *`,
            [taskId, submittedAt]
        )
        const updatedTask = updatedRes.rows[0]
        const notifications = await getReviewNotifications(
            client,
            project,
            task,
            `Task "${task.title}" was submitted for review.`
        )
        return { task: updatedTask, notifications }
    })
}

export async function reviewTask({ taskId, userId, decision, feedback }) {
    return withTransaction(async (client) => {
        const task = await getTaskRow(client, taskId, true)
        const { project, organizationMembership, projectMembership } = await getProjectAccess(client, task.projectId, userId)
        assertCanManageProject(project, organizationMembership, projectMembership, userId)
        if (task.assigneeId === userId) {
            throw serviceError('A reviewer cannot approve or reject their own task', 403)
        }
        if (task.status !== 'IN_REVIEW') {
            throw serviceError('This task is not awaiting review', 409)
        }

        const review = await getLatestReview(client, taskId, true)
        if (!review || review.status !== 'PENDING') {
            throw serviceError('No pending submission was found for this task', 409)
        }
        if (review.submittedById === userId) {
            throw serviceError('A reviewer cannot review their own submission', 403)
        }
        const reviewedAt = new Date()
        const nextStatus = decision === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS'
        await client.query(
            `UPDATE "TaskReview"
             SET status = $2, "reviewedById" = $3, "reviewedAt" = $4, feedback = $5
             WHERE id = $1`,
            [review.id, decision, userId, reviewedAt, feedback || null]
        )
        const taskRes = await client.query(
            `UPDATE "Task"
             SET status = $2::"TaskStatus",
                 progress = CASE WHEN $2::text = 'COMPLETED' THEN 100 ELSE LEAST(progress, 99) END,
                 "completedAt" = CASE WHEN $2::text = 'COMPLETED' THEN $3::timestamptz ELSE NULL::timestamptz END,
                 "updatedAt" = $3::timestamptz
             WHERE id = $1
             RETURNING *`,
            [taskId, nextStatus, reviewedAt]
        )

        if (feedback) {
            await client.query(
                `INSERT INTO "Comment" (id, content, "taskId", "userId", "authorId", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $4, $5, $5)`,
                [randomUUID(), feedback, taskId, userId, reviewedAt]
            )
        }
        const actionText = decision === 'APPROVED'
            ? 'approved'
            : decision === 'REJECTED'
                ? 'rejected'
                : 'requested changes for'
        const notification = task.assigneeId
            ? await insertNotification(client, task.assigneeId, `Your task "${task.title}" was ${actionText}.${feedback ? ` Feedback: ${feedback}` : ''}`)
            : null
        return { task: taskRes.rows[0], notifications: notification ? [notification] : [] }
    })
}

export async function findReviews({ taskId, userId }) {
    const { task } = await getProjectAccessForTask({ query }, taskId, userId)
    const result = await query(
        `SELECT tr.*,
                submitter.name AS "submitterName",
                reviewer.name AS "reviewerName"
         FROM "TaskReview" tr
         JOIN "User" submitter ON submitter.id = tr."submittedById"
         LEFT JOIN "User" reviewer ON reviewer.id = tr."reviewedById"
         WHERE tr."taskId" = $1
         ORDER BY tr."submittedAt" DESC`,
        [task.id]
    )
    return result.rows
}

async function getProjectAccessForTask(client, taskId, userId) {
    const access = await assertTaskAccess(client, taskId, userId)
    return { task: access.task }
}
