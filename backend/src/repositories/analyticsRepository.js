import { query } from '../config/db.js'

export async function overview({ organizationId, userId }) {
    const memRes = await query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    if (memRes.rows.length === 0) {
        const error = new Error('Organization membership required')
        error.statusCode = 403
        throw error
    }

    const now = new Date()
    const [projectsRes, membersRes, tasksRes, completedRes, overdueRes] = await Promise.all([
        query(
            `SELECT COUNT(*)::int as count FROM "Project" WHERE "organizationId" = $1 AND status != 'ARCHIVED'`,
            [organizationId]
        ),
        query(
            `SELECT COUNT(*)::int as count FROM "OrganizationMember" WHERE "organizationId" = $1`,
            [organizationId]
        ),
        query(
            `SELECT COUNT(*)::int as count FROM "Task" t JOIN "Project" p ON t."projectId" = p.id WHERE p."organizationId" = $1`,
            [organizationId]
        ),
        query(
            `SELECT COUNT(*)::int as count FROM "Task" t JOIN "Project" p ON t."projectId" = p.id WHERE p."organizationId" = $1 AND t.status = 'COMPLETED'`,
            [organizationId]
        ),
        query(
            `SELECT COUNT(*)::int as count FROM "Task" t JOIN "Project" p ON t."projectId" = p.id WHERE p."organizationId" = $1 AND t."dueDate" < $2 AND t.status != 'COMPLETED'`,
            [organizationId, now]
        ),
    ])

    return {
        projects: projectsRes.rows[0].count,
        members: membersRes.rows[0].count,
        tasks: tasksRes.rows[0].count,
        completedTasks: completedRes.rows[0].count,
        overdueTasks: overdueRes.rows[0].count,
    }
}
