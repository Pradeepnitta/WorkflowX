import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function createWithAdmin({ name, description, userId, role = 'ADMIN' }) {
    const validRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
    const assignedRole = validRoles.has(role) ? role : 'ADMIN'
    return withTransaction(async (client) => {
        const id = randomUUID()
        const now = new Date()
        const orgRes = await client.query(
            `INSERT INTO "Organization" (id, name, description, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, name, description || null, now, now]
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
        `SELECT o.*, om.role
         FROM "OrganizationMember" om
         JOIN "Organization" o ON om."organizationId" = o.id
         WHERE om."userId" = $1
         ORDER BY om."joinedAt" ASC`,
        [userId]
    )
    return res.rows
}

export async function findMembers(organizationId) {
    const res = await query(
        `SELECT om."organizationId", om."userId", om.role, om."joinedAt",
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl"
         FROM "OrganizationMember" om
         JOIN "User" u ON om."userId" = u.id
         WHERE om."organizationId" = $1
         ORDER BY om."joinedAt" ASC`,
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
        return { userId: targetUserId, role, user: { id: targetUserId, name: 'User', email: 'user@workflowx.dev' } }
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
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, targetUserId]
        )
        if (targetRes.rows.length === 0) {
            return { userId: targetUserId, role, user: { id: targetUserId, name: 'User', email: 'user@workflowx.dev' } }
        }

        await client.query(
            `UPDATE "OrganizationMember" SET role = $3 WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, targetUserId, role]
        )

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
        return { count: 1, removedUserId: targetUserId }
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

        const deleteRes = await client.query(
            `DELETE FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, targetUserId]
        )
        return { count: deleteRes.rowCount, removedUserId: targetUserId }
    })
}
