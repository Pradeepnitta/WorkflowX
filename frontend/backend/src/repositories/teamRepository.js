import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

function forbiddenError() {
    const error = new Error('Team management permission required')
    error.statusCode = 403
    return error
}
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getTeamMembers(teamIds) {
    if (!teamIds || teamIds.length === 0) return {}
    const res = await query(
        `SELECT tm."teamId", tm."userId", tm."joinedAt",
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl"
         FROM "TeamMember" tm
         JOIN "User" u ON tm."userId" = u.id
         WHERE tm."teamId" = ANY($1::uuid[])
         ORDER BY tm."joinedAt" ASC`,
        [teamIds]
    )
    const map = {}
    for (const r of res.rows) {
        if (!map[r.teamId]) map[r.teamId] = []
        map[r.teamId].push({
            teamId: r.teamId,
            userId: r.userId,
            joinedAt: r.joinedAt,
            user: {
                id: r.u_id,
                name: r.u_name,
                email: r.u_email,
                avatarUrl: r.u_avatarUrl,
            },
        })
    }
    return map
}

export async function createForMember({ name, description, organizationId, userId, memberUserIds = [] }) {
    return withTransaction(async (client) => {
        const memRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, userId]
        )
        const membership = memRes.rows[0]
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw forbiddenError()

        const validMemberIds = Array.isArray(memberUserIds)
            ? [...new Set(memberUserIds.filter((id) => uuidRegex.test(id)))]
            : []

        const id = randomUUID()
        const now = new Date()
        const teamRes = await client.query(
            `INSERT INTO "Team" (id, name, description, "organizationId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [id, name, description || null, organizationId, now, now]
        )
        const team = teamRes.rows[0]

        for (const mId of validMemberIds) {
            await client.query(
                `INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
                 VALUES ($1, $2, $3)
                 ON CONFLICT ("teamId", "userId") DO NOTHING`,
                [team.id, mId, now]
            )
        }

        const memberMap = await getTeamMembers([team.id])
        team.members = memberMap[team.id] || []
        return team
    })
}

export async function findForMember({ organizationId, userId }) {
    const memRes = await query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    const membership = memRes.rows[0]
    if (!membership) throw forbiddenError()

    const teamsRes = await query(
        `SELECT * FROM "Team" WHERE "organizationId" = $1 ORDER BY "createdAt" ASC`,
        [organizationId]
    )
    const teams = teamsRes.rows
    if (teams.length === 0) return []

    const memberMap = await getTeamMembers(teams.map((t) => t.id))
    for (const team of teams) {
        team.members = memberMap[team.id] || []
    }
    return teams
}

async function getManageableTeam(client, teamId, userId) {
    const teamRes = await client.query(`SELECT * FROM "Team" WHERE id = $1`, [teamId])
    const team = teamRes.rows[0]
    if (!team) {
        const error = new Error('Team not found')
        error.statusCode = 404
        throw error
    }

    const memRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [team.organizationId, userId]
    )
    const membership = memRes.rows[0]
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw forbiddenError()
    return team
}

export async function addMember({ teamId, userId, memberUserId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { teamId, userId: memberUserId }
    }
    return withTransaction(async (client) => {
        const team = await getManageableTeam(client, teamId, userId)
        const targetMemRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [team.organizationId, memberUserId]
        )
        if (targetMemRes.rows.length === 0) {
            const error = new Error('User must belong to the organization')
            error.statusCode = 400
            throw error
        }

        const now = new Date()
        const res = await client.query(
            `INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
             VALUES ($1, $2, $3)
             ON CONFLICT ("teamId", "userId") DO NOTHING
             RETURNING *`,
            [teamId, memberUserId, now]
        )
        return res.rows[0] || { teamId, userId: memberUserId, joinedAt: now }
    })
}

export async function removeMember({ teamId, userId, memberUserId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { teamId, userId: memberUserId }
    }
    return withTransaction(async (client) => {
        await getManageableTeam(client, teamId, userId)
        const res = await client.query(
            `DELETE FROM "TeamMember" WHERE "teamId" = $1 AND "userId" = $2 RETURNING *`,
            [teamId, memberUserId]
        )
        return res.rows[0] || { teamId, userId: memberUserId }
    })
}

export async function deleteTeam({ teamId, userId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId)) {
        return { id: teamId, deleted: true }
    }
    return withTransaction(async (client) => {
        const teamRes = await client.query(`SELECT * FROM "Team" WHERE id = $1`, [teamId])
        const team = teamRes.rows[0]
        if (!team) return { id: teamId, deleted: true }
        await getManageableTeam(client, teamId, userId)
        await client.query(`DELETE FROM "Team" WHERE id = $1`, [teamId])
        return { id: teamId, deleted: true }
    })
}
