import { query } from '../config/db.js'

export async function search({ organizationId, userId, query: searchTerm }) {
    const memRes = await query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    if (memRes.rows.length === 0) {
        const error = new Error('Organization membership required')
        error.statusCode = 403
        throw error
    }

    const pattern = `%${searchTerm}%`
    const [projectsRes, tasksRes, commentsRes, usersRes] = await Promise.all([
        query(
            `SELECT id, name, status FROM "Project"
             WHERE "organizationId" = $1 AND (name ILIKE $2 OR description ILIKE $2)
             LIMIT 20`,
            [organizationId, pattern]
        ),
        query(
            `SELECT t.id, t.title, t.status, t.priority, t."projectId"
             FROM "Task" t
             JOIN "Project" p ON t."projectId" = p.id
             WHERE p."organizationId" = $1 AND (t.title ILIKE $2 OR t.description ILIKE $2)
             LIMIT 20`,
            [organizationId, pattern]
        ),
        query(
            `SELECT c.id, c.content, c."taskId", c."authorId"
             FROM "Comment" c
             JOIN "Task" t ON c."taskId" = t.id
             JOIN "Project" p ON t."projectId" = p.id
             WHERE p."organizationId" = $1 AND c.content ILIKE $2
             LIMIT 20`,
            [organizationId, pattern]
        ),
        query(
            `SELECT DISTINCT u.id, u.name, u.email
             FROM "User" u
             JOIN "OrganizationMember" om ON u.id = om."userId"
             WHERE om."organizationId" = $1 AND (u.name ILIKE $2 OR u.email ILIKE $2)
             LIMIT 20`,
            [organizationId, pattern]
        ),
    ])

    return {
        projects: projectsRes.rows,
        tasks: tasksRes.rows,
        comments: commentsRes.rows,
        users: usersRes.rows,
    }
}
