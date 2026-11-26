import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const accountFields = {
    name: 'name',
    email: 'email',
    systemRole: 'systemRole',
    accountStatus: 'accountStatus',
}

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

async function assertAdminWithClient(client, actorUserId) {
    if (!uuidRegex.test(actorUserId || '')) throw serviceError('Authenticated user is required', 401)
    const result = await client.query(
        `SELECT "systemRole", "accountStatus" FROM "User" WHERE id = $1`,
        [actorUserId]
    )
    const actor = result.rows[0]
    if (!actor || actor.systemRole !== 'ADMIN' || actor.accountStatus !== 'ACTIVE') {
        throw serviceError('System administrator permission required', 403)
    }
}

export async function assertSystemAdmin(actorUserId) {
    await assertAdminWithClient({ query }, actorUserId)
}

export async function getGlobalOverview({ registeredSince }) {
    const result = await query(
        `SELECT
            (SELECT COUNT(*)::int FROM "User") AS "totalUsers",
            (SELECT COUNT(*)::int FROM "User" WHERE "systemRole" = 'ADMIN') AS "totalAdmins",
            (SELECT COUNT(DISTINCT "userId")::int FROM "OrganizationMember" WHERE role = 'MANAGER') AS "totalManagers",
            (SELECT COUNT(DISTINCT "userId")::int FROM "OrganizationMember" WHERE role = 'MEMBER') AS "totalDevelopers",
            (SELECT COUNT(*)::int FROM "User" WHERE "accountStatus" = 'ACTIVE') AS "activeUsers",
            (SELECT COUNT(*)::int FROM "User" WHERE "accountStatus" <> 'ACTIVE') AS "inactiveUsers",
            (SELECT COUNT(*)::int FROM "User" WHERE "createdAt" >= $1) AS "newRegistrations",
            (SELECT COUNT(*)::int FROM "Project" WHERE status <> 'ARCHIVED') AS "totalProjects",
            (SELECT COUNT(*)::int FROM "Project" WHERE status = 'ACTIVE') AS "activeProjects",
            (SELECT COUNT(*)::int FROM "Team") AS "totalTeams",
            (SELECT COUNT(*)::int FROM "Task") AS "totalTasks",
            (SELECT COUNT(*)::int FROM "Task" WHERE status = 'TODO') AS "pendingTasks",
            (SELECT COUNT(*)::int FROM "Task" WHERE status = 'IN_PROGRESS') AS "inProgressTasks",
            (SELECT COUNT(*)::int FROM "Task" WHERE status = 'IN_REVIEW') AS "tasksUnderReview",
            (SELECT COUNT(*)::int FROM "Task" WHERE status = 'COMPLETED') AS "completedTasks",
            (SELECT COUNT(*)::int FROM "Task"
             WHERE "dueDate" < CURRENT_TIMESTAMP AND status <> 'COMPLETED') AS "overdueTasks"`,
        [registeredSince]
    )
    return result.rows[0]
}

export async function listUsers({ search, role, accountStatus, limit, offset }) {
    const conditions = []
    const values = []
    const addValue = (value) => {
        values.push(value)
        return `$${values.length}`
    }

    if (search) {
        const parameter = addValue(`%${search}%`)
        conditions.push(`(u.name ILIKE ${parameter} OR u.email ILIKE ${parameter})`)
    }
    if (accountStatus) {
        conditions.push(`u."accountStatus" = ${addValue(accountStatus)}`)
    }
    if (role === 'ADMIN') {
        conditions.push(`(u."systemRole" = 'ADMIN' OR EXISTS (
            SELECT 1 FROM "OrganizationMember" filterMembership
            WHERE filterMembership."userId" = u.id AND filterMembership.role = 'ADMIN'
        ))`)
    } else if (role) {
        conditions.push(`EXISTS (
            SELECT 1 FROM "OrganizationMember" filterMembership
            WHERE filterMembership."userId" = u.id AND filterMembership.role = ${addValue(role)}
        )`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const countResult = await query(
        `SELECT COUNT(DISTINCT u.id)::int AS count
         FROM "User" u ${where}`,
        values
    )
    const limitParameter = addValue(limit)
    const offsetParameter = addValue(offset)
    const usersResult = await query(
        `SELECT u.id, u.name, u.email, u."avatarUrl", u."systemRole", u."accountStatus",
                u."createdAt", u."lastActiveAt",
                COALESCE(
                    jsonb_agg(DISTINCT jsonb_build_object(
                        'organizationId', om."organizationId",
                        'role', om.role
                    )) FILTER (WHERE om."organizationId" IS NOT NULL),
                    '[]'::jsonb
                ) AS memberships
         FROM "User" u
         LEFT JOIN "OrganizationMember" om ON om."userId" = u.id
         ${where}
         GROUP BY u.id
         ORDER BY u."createdAt" DESC, u.id
         LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
        values
    )
    return { users: usersResult.rows, total: countResult.rows[0]?.count || 0 }
}

export async function updateUser({ actorUserId, targetUserId, changes }) {
    if (!uuidRegex.test(targetUserId || '')) throw serviceError('User ID must be valid', 400)
    return withTransaction(async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(1887664014)`)
        await assertAdminWithClient(client, actorUserId)

        const targetResult = await client.query(
            `SELECT id, "systemRole", "accountStatus"
             FROM "User" WHERE id = $1 FOR UPDATE`,
            [targetUserId]
        )
        const current = targetResult.rows[0]
        if (!current) throw serviceError('User not found', 404)

        const nextRole = changes.systemRole ?? current.systemRole
        const nextStatus = changes.accountStatus ?? current.accountStatus
        const removingActiveAdmin = current.systemRole === 'ADMIN'
            && current.accountStatus === 'ACTIVE'
            && (nextRole !== 'ADMIN' || nextStatus !== 'ACTIVE')
        if (removingActiveAdmin) {
            const adminsResult = await client.query(
                `SELECT id FROM "User"
                 WHERE "systemRole" = 'ADMIN' AND "accountStatus" = 'ACTIVE'
                 FOR UPDATE`
            )
            if (adminsResult.rows.length <= 1) {
                throw serviceError('The last active system administrator cannot be removed or deactivated', 409)
            }
        }

        const fields = []
        const values = [targetUserId]
        for (const [field, value] of Object.entries(changes)) {
            const column = accountFields[field]
            if (!column) continue
            fields.push(`"${column}" = $${values.length + 1}`)
            values.push(value)
        }
        if (fields.length === 0) throw serviceError('At least one account field is required', 400)
        fields.push(`"updatedAt" = $${values.length + 1}`)
        values.push(new Date())

        const updatedResult = await client.query(
            `UPDATE "User" SET ${fields.join(', ')}
             WHERE id = $1
             RETURNING id, name, email, "avatarUrl", "systemRole", "accountStatus", "createdAt", "lastActiveAt"`,
            values
        )
        if (nextRole !== current.systemRole || nextStatus !== current.accountStatus) {
            await client.query(
                `UPDATE "RefreshToken" SET "revokedAt" = $2
                 WHERE "userId" = $1 AND "revokedAt" IS NULL`,
                [targetUserId, new Date()]
            )
        }
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, $3, 'USER', $4, 'SUCCESS', $5::jsonb, $6)`,
            [
                randomUUID(),
                actorUserId,
                changes.systemRole !== undefined
                    ? 'USER_ROLE_CHANGED'
                    : changes.accountStatus !== undefined
                        ? `USER_${changes.accountStatus}`
                        : 'USER_UPDATED',
                targetUserId,
                JSON.stringify({ changedFields: Object.keys(changes) }),
                new Date(),
            ]
        )
        return updatedResult.rows[0]
    })
}

export async function listAuditLogs({ limit, offset }) {
    const [countResult, logsResult] = await Promise.all([
        query(`SELECT COUNT(*)::int AS count FROM "AuditLog"`),
        query(
            `SELECT log.id, log.action, log."resourceType", log."resourceId",
                    log.result, log.details, log."createdAt",
                    actor.id AS "actorUserId", actor.name AS "actorName", actor.email AS "actorEmail"
             FROM "AuditLog" log
             LEFT JOIN "User" actor ON actor.id = log."actorUserId"
             ORDER BY log."createdAt" DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        ),
    ])
    return { logs: logsResult.rows, total: countResult.rows[0]?.count || 0 }
}
