import { pool, query } from '../config/db.js'

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export async function overview({ organizationId, userId }) {
    const membershipRes = await query(
        `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    const membership = membershipRes.rows[0]
    if (!membership) throw serviceError('Organization membership required', 403)
    if (!['ADMIN', 'MANAGER'].includes(membership.role)) {
        throw serviceError('Manager or Admin permission required', 403)
    }

    const managerScope = membership.role === 'MANAGER'
        ? `AND (
                p."createdById" = $2
                OR EXISTS (
                    SELECT 1 FROM "ProjectMember" pm
                    WHERE pm."projectId" = p.id AND pm."userId" = $2
                )
            )`
        : ''
    const teamScope = membership.role === 'MANAGER'
        ? `AND (
                t."createdById" = $2
                OR EXISTS (
                    SELECT 1 FROM "TeamMember" tm
                    WHERE tm."teamId" = t.id AND tm."userId" = $2
                )
            )`
        : ''
    const projectParams = membership.role === 'MANAGER' ? [organizationId, userId] : [organizationId]
    const now = new Date()

    const client = await pool.connect()
    try {
        const projectCountsRes = await client.query(
            `SELECT
                COUNT(*) FILTER (WHERE p.status <> 'ARCHIVED')::int AS total,
                COUNT(*) FILTER (WHERE p.status = 'ACTIVE')::int AS active,
                COUNT(*) FILTER (WHERE p.status = 'COMPLETED')::int AS completed
             FROM "Project" p
             WHERE p."organizationId" = $1 ${managerScope}`,
            projectParams
        )
        const taskCountsRes = await client.query(
            `SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE task.status = 'TODO')::int AS pending,
                COUNT(*) FILTER (WHERE task.status = 'IN_PROGRESS')::int AS in_progress,
                COUNT(*) FILTER (WHERE task.status = 'IN_REVIEW')::int AS in_review,
                COUNT(*) FILTER (WHERE task.status = 'COMPLETED')::int AS completed,
                COUNT(*) FILTER (
                    WHERE task."dueDate" < $${membership.role === 'MANAGER' ? '3' : '2'}
                      AND task.status <> 'COMPLETED'
                )::int AS overdue
             FROM "Task" task
             JOIN "Project" p ON p.id = task."projectId"
             WHERE p."organizationId" = $1 ${managerScope}`,
            membership.role === 'MANAGER' ? [organizationId, userId, now] : [organizationId, now]
        )
        const priorityCountsRes = await client.query(
            `SELECT task.priority, COUNT(*)::int AS count
             FROM "Task" task
             JOIN "Project" p ON p.id = task."projectId"
             WHERE p."organizationId" = $1 ${managerScope}
             GROUP BY task.priority`,
            projectParams
        )
        const membersRes = await client.query(
            `SELECT
                COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE om.role = 'ADMIN')::int AS admins,
                COUNT(*) FILTER (WHERE om.role = 'MANAGER')::int AS managers,
                COUNT(*) FILTER (WHERE om.role = 'MEMBER')::int AS developers,
                COUNT(*) FILTER (WHERE om.role = 'VIEWER')::int AS viewers,
                COUNT(*) FILTER (WHERE u."accountStatus" = 'ACTIVE')::int AS "activeUsers",
                COUNT(*) FILTER (WHERE u."accountStatus" <> 'ACTIVE')::int AS "inactiveUsers"
             FROM "OrganizationMember" om
             JOIN "User" u ON u.id = om."userId"
             WHERE om."organizationId" = $1`,
            [organizationId]
        )
        const teamsRes = await client.query(
            `SELECT COUNT(*)::int AS count
             FROM "Team" t
             WHERE t."organizationId" = $1 ${teamScope}`,
            projectParams
        )
        const developersRes = await client.query(
            `WITH scoped_projects AS (
                SELECT p.id
                FROM "Project" p
                WHERE p."organizationId" = $1 ${managerScope}
            ), scoped_teams AS (
                SELECT t.id
                FROM "Team" t
                WHERE t."organizationId" = $1 ${teamScope}
            ), visible_developers AS (
                SELECT pm."userId"
                FROM "ProjectMember" pm
                JOIN scoped_projects p ON p.id = pm."projectId"
                UNION
                SELECT tm."userId"
                FROM "TeamMember" tm
                JOIN scoped_teams t ON t.id = tm."teamId"
            )
             SELECT COUNT(DISTINCT om."userId")::int AS count
             FROM visible_developers vd
             JOIN "OrganizationMember" om
               ON om."userId" = vd."userId" AND om."organizationId" = $1
             WHERE om.role = 'MEMBER'`,
            projectParams
        )
        const projectsRes = await client.query(
            `SELECT p.id, p.name, p.description, p.status, p.priority, p."startDate", p."dueDate",
                    p."teamId", team.name AS "teamName",
                    COUNT(task.id)::int AS "taskCount",
                    COUNT(task.id) FILTER (WHERE task.status = 'COMPLETED')::int AS "completedTasks",
                    COUNT(task.id) FILTER (WHERE task.status = 'IN_PROGRESS')::int AS "inProgressTasks",
                    COUNT(task.id) FILTER (WHERE task.status = 'IN_REVIEW')::int AS "reviewTasks",
                    COUNT(task.id) FILTER (WHERE task.status = 'TODO')::int AS "pendingTasks",
                    COALESCE(ROUND(AVG(
                        CASE WHEN task.status = 'COMPLETED' THEN 100 ELSE task.progress END
                    )), 0)::int AS progress
             FROM "Project" p
             LEFT JOIN "Team" team ON team.id = p."teamId"
             LEFT JOIN "Task" task ON task."projectId" = p.id
             WHERE p."organizationId" = $1 ${managerScope}
             GROUP BY p.id, team.name
             ORDER BY p."dueDate" NULLS LAST, p."createdAt" DESC`,
            projectParams
        )
        const teamsOverviewRes = await client.query(
            `SELECT t.id, t.name,
                    COUNT(DISTINCT tm."userId")::int AS developers,
                    COUNT(DISTINCT task.id)::int AS "activeTasks",
                    COUNT(DISTINCT task.id) FILTER (WHERE task.status = 'COMPLETED')::int AS "completedTasks",
                    COUNT(DISTINCT task.id) FILTER (WHERE task.status = 'IN_PROGRESS')::int AS "inProgressTasks",
                    COUNT(DISTINCT task.id) FILTER (WHERE task.status = 'IN_REVIEW')::int AS "reviewTasks"
             FROM "Team" t
             LEFT JOIN "TeamMember" tm ON tm."teamId" = t.id
             LEFT JOIN "Task" task
               ON (
                    task."teamId" = t.id
                    OR (
                        task."teamId" IS NULL
                        AND EXISTS (
                            SELECT 1 FROM "Project" team_project
                            WHERE team_project.id = task."projectId" AND team_project."teamId" = t.id
                        )
                    )
               )
              AND EXISTS (
                    SELECT 1 FROM "Project" p
                    WHERE p.id = task."projectId" AND p."organizationId" = $1 ${managerScope}
              )
             WHERE t."organizationId" = $1 ${teamScope}
             GROUP BY t.id
             ORDER BY t.name`,
            projectParams
        )
        const developerWorkloadRes = await client.query(
            `SELECT u.id AS "userId", u.name, u.email, u."avatarUrl",
                    COUNT(DISTINCT p.id)::int AS "assignedProjects",
                    COUNT(task.id)::int AS "totalTasks",
                    COUNT(task.id) FILTER (WHERE task.status = 'IN_PROGRESS')::int AS "inProgressTasks",
                    COUNT(task.id) FILTER (WHERE task.status = 'COMPLETED')::int AS "completedTasks",
                    COUNT(task.id) FILTER (
                        WHERE task."dueDate" < $${membership.role === 'MANAGER' ? '3' : '2'}
                          AND task.status <> 'COMPLETED'
                    )::int AS "overdueTasks"
             FROM "Task" task
             JOIN "Project" p ON p.id = task."projectId"
             JOIN "User" u ON u.id = task."assigneeId"
             JOIN "OrganizationMember" om
               ON om."organizationId" = p."organizationId" AND om."userId" = u.id
             WHERE p."organizationId" = $1
               AND om.role = 'MEMBER' ${managerScope}
             GROUP BY u.id
             ORDER BY "totalTasks" DESC, u.name`,
            membership.role === 'MANAGER' ? [organizationId, userId, now] : [organizationId, now]
        )
        const weeklyRes = await client.query(
            `WITH scoped_projects AS (
                SELECT p.id
                FROM "Project" p
                WHERE p."organizationId" = $1 ${managerScope}
            ), days AS (
                SELECT generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS day
            )
             SELECT days.day::text AS date,
                    COUNT(task.id) FILTER (
                        WHERE task.status = 'COMPLETED'
                          AND task."completedAt" >= days.day
                          AND task."completedAt" < days.day + INTERVAL '1 day'
                    )::int AS completed,
                    COUNT(task.id) FILTER (
                        WHERE task."createdAt" >= days.day
                          AND task."createdAt" < days.day + INTERVAL '1 day'
                    )::int AS created
             FROM days
             LEFT JOIN "Task" task
               ON task."projectId" IN (SELECT id FROM scoped_projects)
              AND (
                    (
                        task.status = 'COMPLETED'
                        AND task."completedAt" >= days.day
                        AND task."completedAt" < days.day + INTERVAL '1 day'
                    )
                    OR (
                        task."createdAt" >= days.day
                        AND task."createdAt" < days.day + INTERVAL '1 day'
                    )
              )
             GROUP BY days.day
             ORDER BY days.day`,
            projectParams
        )
        const deadlinesRes = await client.query(
            `SELECT task.id, task.title, task.status, task.priority, task."dueDate",
                    p.id AS "projectId", p.name AS "projectName",
                    u.id AS "assigneeId", u.name AS "assigneeName"
             FROM "Task" task
             JOIN "Project" p ON p.id = task."projectId"
             LEFT JOIN "User" u ON u.id = task."assigneeId"
             WHERE p."organizationId" = $1
               AND task."dueDate" >= $${membership.role === 'MANAGER' ? '3' : '2'}
               AND task."dueDate" < $${membership.role === 'MANAGER' ? '4' : '3'}::timestamptz + INTERVAL '14 days'
               AND task.status <> 'COMPLETED' ${managerScope}
             ORDER BY task."dueDate" ASC
             LIMIT 30`,
            membership.role === 'MANAGER'
                ? [organizationId, userId, now, now]
                : [organizationId, now, now]
        )
        const pendingReviewsRes = await client.query(
            `SELECT task.id, task.title, task.description, task.status, task.priority,
                    task."dueDate", task."projectId", p.name AS "projectName",
                    task."assigneeId", assignee.name AS "assigneeName",
                    review."submittedAt", review."submissionDetails", review."submittedById"
             FROM "Task" task
             JOIN "Project" p ON p.id = task."projectId"
             JOIN LATERAL (
                 SELECT * FROM "TaskReview" tr
                 WHERE tr."taskId" = task.id AND tr.status = 'PENDING'
                 ORDER BY tr."submittedAt" DESC
                 LIMIT 1
             ) review ON TRUE
             LEFT JOIN "User" assignee ON assignee.id = task."assigneeId"
             WHERE p."organizationId" = $1
               AND task.status = 'IN_REVIEW' ${managerScope}
             ORDER BY review."submittedAt" ASC`,
            projectParams
        )

        const projectCounts = projectCountsRes.rows[0]
        const taskCounts = taskCountsRes.rows[0]
        return {
            projects: projectCounts.total,
            activeProjects: projectCounts.active,
            completedProjects: projectCounts.completed,
            members: membersRes.rows[0].count,
            userCounts: {
                total: membersRes.rows[0].count,
                admins: membersRes.rows[0].admins,
                managers: membersRes.rows[0].managers,
                developers: membersRes.rows[0].developers,
                viewers: membersRes.rows[0].viewers,
                active: membersRes.rows[0].activeUsers,
                inactive: membersRes.rows[0].inactiveUsers,
            },
            totalTeams: teamsRes.rows[0].count,
            totalDevelopers: developersRes.rows[0].count,
            tasks: taskCounts.total,
            pendingTasks: taskCounts.pending,
            todoTasks: taskCounts.pending,
            inProgressTasks: taskCounts.in_progress,
            tasksUnderReview: taskCounts.in_review,
            completedTasks: taskCounts.completed,
            overdueTasks: taskCounts.overdue,
            projectStats: projectsRes.rows,
            teamStats: teamsOverviewRes.rows,
            developerWorkload: developerWorkloadRes.rows,
            weeklyTaskCompletion: weeklyRes.rows,
            deadlineTracking: deadlinesRes.rows,
            pendingReviews: pendingReviewsRes.rows,
            priorityDistribution: priorityCountsRes.rows,
        }
    } finally {
        client.release()
    }
}
