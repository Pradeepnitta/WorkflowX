import { query, withTransaction } from '../config/db.js'
import { randomUUID } from 'node:crypto'

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function requireUuid(value, label) {
    if (!uuidRegex.test(value || '')) throw serviceError(`${label} must be a valid ID`, 400)
}

async function getTeamMembers(client, teamIds) {
    if (!teamIds || teamIds.length === 0) return {}
    const res = await client.query(
        `SELECT tm."teamId", tm."userId", tm."joinedAt",
                u.id as "u_id", u.name as "u_name", u.email as "u_email", u."avatarUrl" as "u_avatarUrl",
                om.role as "u_role"
         FROM "TeamMember" tm
         JOIN "Team" t ON t.id = tm."teamId"
         JOIN "User" u ON tm."userId" = u.id
         LEFT JOIN "OrganizationMember" om
           ON om."organizationId" = t."organizationId" AND om."userId" = tm."userId"
         WHERE tm."teamId" = ANY($1::uuid[])
         ORDER BY tm."joinedAt" ASC`,
        [teamIds]
    )
    const map = {}
    for (const row of res.rows) {
        if (!map[row.teamId]) map[row.teamId] = []
        map[row.teamId].push({
            teamId: row.teamId,
            userId: row.userId,
            joinedAt: row.joinedAt,
            user: {
                id: row.u_id,
                name: row.u_name,
                email: row.u_email,
                avatarUrl: row.u_avatarUrl,
                role: row.u_role,
            },
        })
    }
    return map
}

async function addProjectsToTeams(client, teams) {
    if (teams.length === 0) return
    const res = await client.query(
        `SELECT id, name, "teamId" FROM "Project" WHERE "teamId" = ANY($1::uuid[])`,
        [teams.map((team) => team.id)]
    )
    const projectsByTeam = new Map(teams.map((team) => [team.id, []]))
    for (const project of res.rows) {
        projectsByTeam.get(project.teamId)?.push({ id: project.id, name: project.name })
    }
    for (const team of teams) {
        team.projects = projectsByTeam.get(team.id) || []
    }
}

export async function createForMember({ name, description, organizationId, userId, memberUserIds = [] }) {
    requireUuid(organizationId, 'Organization ID')
    requireUuid(userId, 'User ID')
    return withTransaction(async (client) => {
        const membershipRes = await client.query(
            `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [organizationId, userId]
        )
        const membership = membershipRes.rows[0]
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) {
            throw serviceError('Team management permission required', 403)
        }

        const uniqueMemberIds = [...new Set(memberUserIds)]
        for (const memberUserId of uniqueMemberIds) {
            requireUuid(memberUserId, 'Member ID')
            const targetRes = await client.query(
                `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
                [organizationId, memberUserId]
            )
            const targetMembership = targetRes.rows[0]
            if (!targetMembership) throw serviceError('User must belong to the organization', 400)
            if (membership.role === 'MANAGER' && targetMembership.role !== 'MEMBER') {
                throw serviceError('Managers can only add developers to their teams', 403)
            }
        }

        const id = randomUUID()
        const now = new Date()
        const teamRes = await client.query(
            `INSERT INTO "Team" (id, name, description, "organizationId", "createdById", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [id, name, description || null, organizationId, userId, now, now]
        )
        const team = teamRes.rows[0]
        const members = [...new Set([userId, ...uniqueMemberIds])]

        for (const memberUserId of members) {
            await client.query(
                `INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
                 VALUES ($1, $2, $3)
                 ON CONFLICT ("teamId", "userId") DO NOTHING`,
                [team.id, memberUserId, now]
            )
        }

        const memberMap = await getTeamMembers(client, [team.id])
        team.members = memberMap[team.id] || []
        team.projects = []
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, 'TEAM_CREATED', 'TEAM', $3, 'SUCCESS', $4::jsonb, $5)`,
            [randomUUID(), userId, team.id, JSON.stringify({ organizationId, name }), now]
        )
        return team
    })
}

export async function findForMember({ organizationId, userId }) {
    requireUuid(organizationId, 'Organization ID')
    requireUuid(userId, 'User ID')
    const membershipRes = await query(
        `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [organizationId, userId]
    )
    const membership = membershipRes.rows[0]
    if (!membership) throw serviceError('Organization membership required', 403)

    const teamsRes = await query(
        `SELECT t.*,
                (
                    $3 = 'ADMIN'
                    OR (
                        $3 = 'MANAGER'
                        AND (
                            t."createdById" = $2
                            OR EXISTS (
                                SELECT 1 FROM "TeamMember" manager_team
                                WHERE manager_team."teamId" = t.id AND manager_team."userId" = $2
                            )
                        )
                    )
                ) AS "canManage"
         FROM "Team" t
         WHERE t."organizationId" = $1
           AND (
                $3 = 'ADMIN'
                OR t."createdById" = $2
                OR EXISTS (
                    SELECT 1 FROM "TeamMember" tm
                    WHERE tm."teamId" = t.id AND tm."userId" = $2
                )
           )
         ORDER BY t."createdAt" ASC`,
        [organizationId, userId, membership.role]
    )
    const teams = teamsRes.rows
    const memberMap = await getTeamMembers({ query }, teams.map((team) => team.id))
    for (const team of teams) {
        team.members = memberMap[team.id] || []
    }
    await addProjectsToTeams({ query }, teams)
    return teams
}

async function getManageableTeam(client, teamId, userId) {
    requireUuid(teamId, 'Team ID')
    requireUuid(userId, 'User ID')
    const teamRes = await client.query(`SELECT * FROM "Team" WHERE id = $1`, [teamId])
    const team = teamRes.rows[0]
    if (!team) throw serviceError('Team not found', 404)

    const membershipRes = await client.query(
        `SELECT * FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
        [team.organizationId, userId]
    )
    const membership = membershipRes.rows[0]
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) {
        throw serviceError('Team management permission required', 403)
    }
    if (membership.role === 'MANAGER' && team.createdById !== userId) {
        const teamMemberRes = await client.query(
            `SELECT 1 FROM "TeamMember" WHERE "teamId" = $1 AND "userId" = $2`,
            [teamId, userId]
        )
        if (teamMemberRes.rows.length === 0) {
            throw serviceError('Team management permission required', 403)
        }
    }
    return { team, membership }
}

export async function updateTeam({ teamId, userId, changes }) {
    return withTransaction(async (client) => {
        await getManageableTeam(client, teamId, userId)
        const fields = []
        const values = [teamId]
        let index = 2
        for (const field of ['name', 'description']) {
            if (changes[field] !== undefined) {
                fields.push(`"${field}" = $${index++}`)
                values.push(changes[field])
            }
        }
        if (fields.length === 0) throw serviceError('At least one valid team field is required', 400)
        fields.push(`"updatedAt" = $${index++}`)
        values.push(new Date())
        const result = await client.query(
            `UPDATE "Team" SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
            values
        )
        const team = result.rows[0]
        const memberMap = await getTeamMembers(client, [teamId])
        team.members = memberMap[teamId] || []
        await addProjectsToTeams(client, [team])
        return team
    })
}

export async function addMember({ teamId, userId, memberUserId }) {
    return withTransaction(async (client) => {
        const { team, membership } = await getManageableTeam(client, teamId, userId)
        requireUuid(memberUserId, 'Member ID')
        const targetRes = await client.query(
            `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
            [team.organizationId, memberUserId]
        )
        const targetMembership = targetRes.rows[0]
        if (!targetMembership) throw serviceError('User must belong to the organization', 400)
        if (membership.role === 'MANAGER' && targetMembership.role !== 'MEMBER') {
            throw serviceError('Managers can only add developers to their teams', 403)
        }

        const now = new Date()
        const result = await client.query(
            `INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
             VALUES ($1, $2, $3)
             ON CONFLICT ("teamId", "userId") DO NOTHING
             RETURNING *`,
            [teamId, memberUserId, now]
        )
        await client.query(
            `INSERT INTO "AuditLog" (
                id, "actorUserId", action, "resourceType", "resourceId", result, details, "createdAt"
             )
             VALUES ($1, $2, 'TEAM_MEMBER_ADDED', 'TEAM', $3, 'SUCCESS', $4::jsonb, $5)`,
            [randomUUID(), userId, teamId, JSON.stringify({ organizationId: team.organizationId, memberUserId }), now]
        )
        return result.rows[0] || { teamId, userId: memberUserId, joinedAt: now }
    })
}

export async function removeMember({ teamId, userId, memberUserId }) {
    return withTransaction(async (client) => {
        const { team, membership } = await getManageableTeam(client, teamId, userId)
        requireUuid(memberUserId, 'Member ID')
        if (membership.role === 'MANAGER' && team.createdById === memberUserId) {
            throw serviceError('Only an Admin can remove the team owner', 403)
        }
        if (membership.role === 'MANAGER') {
            const targetRes = await client.query(
                `SELECT role FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
                [team.organizationId, memberUserId]
            )
            if (targetRes.rows[0]?.role !== 'MEMBER') {
                throw serviceError('Managers can only remove developers from their teams', 403)
            }
        }
        const result = await client.query(
            `DELETE FROM "TeamMember" WHERE "teamId" = $1 AND "userId" = $2 RETURNING *`,
            [teamId, memberUserId]
        )
        return result.rows[0] || { teamId, userId: memberUserId }
    })
}

export async function deleteTeam({ teamId, userId }) {
    return withTransaction(async (client) => {
        await getManageableTeam(client, teamId, userId)
        await client.query(`DELETE FROM "Team" WHERE id = $1`, [teamId])
        return { id: teamId, deleted: true }
    })
}
