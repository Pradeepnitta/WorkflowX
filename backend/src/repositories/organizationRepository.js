import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function repoError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

async function writeOrgAuditLog(client, { actorUserId, action, resourceType, resourceId, details = {} }) {
    await client.query(
        `INSERT INTO "AuditLog" (
            id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
         )
         VALUES ($1, $2, $3, $4, $5, 'SUCCESS', $6::jsonb, $7)`,
        [randomUUID(), actorUserId, action, resourceType, resourceId || null, JSON.stringify(details), new Date()]
    )
}

export async function createWithAdmin({ name, description, userId, role = 'ADMIN' }) {
    const validRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
    const assignedRole = validRoles.has(role) ? role : 'ADMIN'
    return withTransaction(async (client) => {
        const trimmedName = (name || '').trim()
        const existingOrgRes = await client.query(
            `SELECT * FROM "Organization" WHERE LOWER(TRIM(name)) = LOWER($1) ORDER BY "createdAt" ASC LIMIT 1`,
            [trimmedName]
        )
        const now = new Date()
        if (existingOrgRes.rows.length > 0) {
            const organization = existingOrgRes.rows[0]
            const memberCheck = await client.query(
                `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
                [organization.id, userId]
            )
            if (memberCheck.rows.length === 0) {
                await client.query(
                    `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
                     VALUES ($1, $2, $3, $4)`,
                    [organization.id, userId, assignedRole, now]
                )
            }
            return organization
        }

        const id = randomUUID()
        const orgRes = await client.query(
            `INSERT INTO "Organization" (id, name, description, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, trimmedName, description || null, now, now]
        )
        const organization = orgRes.rows[0]
        await client.query(
            `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
             VALUES ($1, $2, $3, $4)`,
            [organization.id, userId, assignedRole, now]
        )
        return organization
    })
}

export async function findForUser(userId) {
    const res = await query(
        `SELECT DISTINCT ON (LOWER(TRIM(o.name))) o.*, om.role
         FROM "OrganizationMember" om
         JOIN "Organization" o ON om."organizationId" = o.id
         WHERE om."userId" = $1
         ORDER BY LOWER(TRIM(o.name)), om."joinedAt" ASC`,
        [userId]
    )
    return res.rows
}

export async function findMembershipRole(organizationId, userId) {
    const res = await query(
        `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 LIMIT 1`,
        [organizationId, userId]
    )
    return res.rows[0]?.role || null
}

export async function findMembers(organizationId) {
    const res = await query(
        `SELECT DISTINCT ON (u.id)
                om."organizationId", om."userId", om.role, om."joinedAt",
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl"
         FROM "OrganizationMember" om
         JOIN "User" u ON om."userId" = u.id
         JOIN "Organization" o ON om."organizationId" = o.id
         WHERE om."organizationId" = $1
            OR LOWER(TRIM(o.name)) IN (SELECT LOWER(TRIM(name)) FROM "Organization" WHERE id = $1)
         ORDER BY u.id, om."joinedAt" ASC`,
        [organizationId]
    )
    const members = res.rows.map((r) => ({
        organizationId: r.organizationId,
        userId: r.userId,
        role: r.role,
        joinedAt: r.joinedAt,
        user: {
            id: r.u_id,
            name: r.u_name,
            email: r.u_email,
            avatarUrl: r.u_avatarUrl,
        },
    }))

    // Also include any pending invitations that haven't been accepted yet
    try {
        const invRes = await query(
            `SELECT i.id, i.email, i.role, i."createdAt" as "joinedAt", i."organizationId"
             FROM "Invitation" i
             WHERE i."organizationId" = $1 AND i.status = 'PENDING'`,
            [organizationId]
        )
        const existingEmails = new Set(members.map((m) => (m.user?.email || '').toLowerCase()))
        for (const inv of invRes.rows) {
            if (inv.email && !existingEmails.has(inv.email.toLowerCase())) {
                existingEmails.add(inv.email.toLowerCase())
                members.push({
                    organizationId: inv.organizationId,
                    userId: inv.id,
                    role: inv.role,
                    joinedAt: inv.joinedAt,
                    user: {
                        id: inv.id,
                        name: inv.email.split('@')[0],
                        email: inv.email,
                        avatarUrl: null,
                    },
                })
            }
        }
    } catch {
        // ignore if Invitation query fails
    }

    return members
}

export async function updateMemberRole({ organizationId, targetUserId, role, adminUserId }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(targetUserId) || !uuidRegex.test(adminUserId)) {
        const error = new Error('Organization, target user, and actor IDs must be valid')
        error.statusCode = 400
        throw error
    }
    return withTransaction(async (client) => {
        const adminRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, adminUserId]
        )
        const adminMembership = adminRes.rows[0]
        if (!adminMembership || adminMembership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
            error.statusCode = 403
            throw error
        }

        const targetRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 FOR UPDATE`,
            [organizationId, targetUserId]
        )
        const targetMembership = targetRes.rows[0]
        if (!targetMembership) {
            throw repoError('Organization member not found', 404)
        }

        if (targetMembership.role === 'ADMIN' && role !== 'ADMIN') {
            const adminsRes = await client.query(
                `SELECT "userId" FROM "OrganizationMember"
                 WHERE "organizationId" = $1 AND role = 'ADMIN'
                 FOR UPDATE`,
                [organizationId]
            )
            if (adminsRes.rows.length <= 1) {
                throw repoError('The last organization administrator cannot be demoted', 409)
            }
        }

        await client.query(
            `UPDATE "OrganizationMember" SET role = $3 WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, targetUserId, role]
        )

        await writeOrgAuditLog(client, {
            actorUserId: adminUserId,
            action: 'ORGANIZATION_MEMBER_ROLE_CHANGED',
            resourceType: 'ORGANIZATION_MEMBER',
            resourceId: targetUserId,
            details: { organizationId, previousRole: targetMembership.role, newRole: role },
        })

        const userRes = await client.query(
            `SELECT id, name, email FROM "User" WHERE id = $1`,
            [targetUserId]
        )
        return {
            organizationId,
            userId: targetUserId,
            role,
            user: userRes.rows[0] || { id: targetUserId, name: 'User', email: 'user@workflowx.dev' },
        }
    })
}

export async function removeMember({ organizationId, targetUserId, adminUserId }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(targetUserId) || !uuidRegex.test(adminUserId)) {
        const error = new Error('Organization, target user, and actor IDs must be valid')
        error.statusCode = 400
        throw error
    }
    return withTransaction(async (client) => {
        const adminRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, adminUserId]
        )
        const adminMembership = adminRes.rows[0]
        if (!adminMembership || adminMembership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
            error.statusCode = 403
            throw error
        }

        const targetRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2 FOR UPDATE`,
            [organizationId, targetUserId]
        )
        const targetMembership = targetRes.rows[0]
        if (!targetMembership) {
            throw repoError('Organization member not found', 404)
        }
        if (targetMembership.role === 'ADMIN') {
            const adminsRes = await client.query(
                `SELECT "userId" FROM "OrganizationMember"
                 WHERE "organizationId" = $1 AND role = 'ADMIN'
                 FOR UPDATE`,
                [organizationId]
            )
            if (adminsRes.rows.length <= 1) {
                throw repoError('The last organization administrator cannot be removed', 409)
            }
        }

        const deleteRes = await client.query(
            `DELETE FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, targetUserId]
        )
        await writeOrgAuditLog(client, {
            actorUserId: adminUserId,
            action: 'ORGANIZATION_MEMBER_REMOVED',
            resourceType: 'ORGANIZATION_MEMBER',
            resourceId: targetUserId,
            details: { organizationId, removedRole: targetMembership.role },
        })
        return { count: deleteRes.rowCount, removedUserId: targetUserId }
    })
}

export async function updateOrganization({ organizationId, adminUserId, changes }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(adminUserId)) {
        throw repoError('Organization and actor IDs must be valid', 400)
    }
    return withTransaction(async (client) => {
        const adminRes = await client.query(
            `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, adminUserId]
        )
        if (adminRes.rows[0]?.role !== 'ADMIN') {
            throw repoError('Organization admin permission required', 403)
        }

        const fields = []
        const values = [organizationId]
        let idx = 2
        if (changes.name !== undefined) {
            fields.push(`name = $${idx++}`)
            values.push(changes.name)
        }
        if (changes.description !== undefined) {
            fields.push(`description = $${idx++}`)
            values.push(changes.description)
        }
        if (fields.length === 0) throw repoError('At least one organization field is required', 400)
        fields.push(`"updatedAt" = $${idx++}`)
        values.push(new Date())

        const updatedRes = await client.query(
            `UPDATE "Organization" SET ${fields.join(', ')} WHERE id = $1 RETURNING id, name, description, "updatedAt"`,
            values
        )
        if (updatedRes.rows.length === 0) {
            throw repoError('Organization not found', 404)
        }
        await writeOrgAuditLog(client, {
            actorUserId: adminUserId,
            action: 'WORKSPACE_SETTINGS_UPDATED',
            resourceType: 'ORGANIZATION',
            resourceId: organizationId,
            details: { organizationId, changedFields: Object.keys(changes) },
        })
        return updatedRes.rows[0]
    })
}

export async function createOrgUser({ organizationId, adminUserId, name, email, passwordHash, role, accountStatus }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(adminUserId)) {
        throw repoError('Organization and actor IDs must be valid', 400)
    }
    return withTransaction(async (client) => {
        const adminRes = await client.query(
            `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, adminUserId]
        )
        if (adminRes.rows[0]?.role !== 'ADMIN') {
            throw repoError('Organization admin permission required', 403)
        }

        const existingRes = await client.query(
            `SELECT id FROM "User" WHERE LOWER(email) = $1 LIMIT 1`,
            [email]
        )
        if (existingRes.rows.length > 0) {
            throw repoError('A user with that email address already exists', 409)
        }

        const userId = randomUUID()
        const now = new Date()
        const userRes = await client.query(
            `INSERT INTO "User" (id, name, email, "passwordHash", "systemRole", "accountStatus", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7)
             RETURNING id, name, email, "avatarUrl", "systemRole", "accountStatus", "createdAt", "lastActiveAt"`,
            [userId, name, email, passwordHash, accountStatus, now, now]
        )
        await client.query(
            `INSERT INTO "OrganizationMember" ("organizationId", "userId", role, "joinedAt")
             VALUES ($1, $2, $3, $4)`,
            [organizationId, userId, role, now]
        )
        await writeOrgAuditLog(client, {
            actorUserId: adminUserId,
            action: 'USER_CREATED',
            resourceType: 'USER',
            resourceId: userId,
            details: { organizationId, role, accountStatus },
        })
        return {
            ...userRes.rows[0],
            userId,
            role,
            joinedAt: now,
        }
    })
}

export async function listOrgAuditLogs({ organizationId, adminUserId, search, action, from, to, limit, offset }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(adminUserId)) {
        throw repoError('Organization and actor IDs must be valid', 400)
    }
    const adminRes = await query(
        `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, adminUserId]
    )
    if (adminRes.rows[0]?.role !== 'ADMIN') {
        throw repoError('Organization admin permission required', 403)
    }

    const conditions = [
        `(log.details->>'organizationId' = $1::text OR log."resourceId" = $1::text OR log."actorUserId" IN (SELECT "userId" FROM "OrganizationMember" WHERE "organizationId" = $1::uuid))`,
    ]
    const values = [organizationId]
    const addValue = (value) => {
        values.push(value)
        return `$${values.length}`
    }

    if (search) {
        const param = addValue(`%${search}%`)
        conditions.push(`(log.action ILIKE ${param} OR log."resourceType" ILIKE ${param} OR COALESCE(actor.name, '') ILIKE ${param} OR COALESCE(actor.email, '') ILIKE ${param})`)
    }
    if (action) {
        conditions.push(`log.action = ${addValue(action)}`)
    }
    if (from) {
        conditions.push(`log."createdAt" >= ${addValue(from)}`)
    }
    if (to) {
        conditions.push(`log."createdAt" <= ${addValue(to)}`)
    }

    const where = `WHERE ${conditions.join(' AND ')}`
    const countRes = await query(
        `SELECT COUNT(*)::int AS count
         FROM "AuditLog" log
         LEFT JOIN "User" actor ON actor.id = log."actorUserId"
         ${where}`,
        values
    )
    const limitParam = addValue(limit)
    const offsetParam = addValue(offset)
    const logsRes = await query(
        `SELECT log.id, log.action, log."resourceType", log."resourceId",
                log.result, log.details, log."createdAt",
                actor.id AS "actorUserId", actor.name AS "actorName", actor.email AS "actorEmail"
         FROM "AuditLog" log
         LEFT JOIN "User" actor ON actor.id = log."actorUserId"
         ${where}
         ORDER BY log."createdAt" DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
        values
    )
    return { logs: logsRes.rows, total: countRes.rows[0]?.count || 0 }
}
