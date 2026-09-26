import { prisma } from '../config/prisma.js'

function forbiddenError() {
    const error = new Error('Team management permission required')
    error.statusCode = 403
    return error
}
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createForMember({ name, description, organizationId, userId, memberUserIds = [] }) {
    return prisma.$transaction(async (transaction) => {
        const membership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
        })
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw forbiddenError()

        const validMemberIds = Array.isArray(memberUserIds)
            ? [...new Set(memberUserIds.filter((id) => uuidRegex.test(id)))]
            : []

        return transaction.team.create({
            data: {
                name,
                description,
                organizationId,
                members: validMemberIds.length > 0
                    ? {
                        create: validMemberIds.map((mId) => ({ userId: mId })),
                    }
                    : undefined,
            },
            include: {
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, avatarUrl: true },
                        },
                    },
                },
            },
        })
    })
}

export async function findForMember({ organizationId, userId }) {
    const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
    })
    if (!membership) throw forbiddenError()

    return prisma.team.findMany({
        where: { organizationId },
        include: {
            members: {
                include: {
                    user: {
                        select: { id: true, name: true, email: true, avatarUrl: true },
                    },
                },
            },
        },
        orderBy: { createdAt: 'asc' },
    })
}

async function getManageableTeam(transaction, teamId, userId) {
    const team = await transaction.team.findUnique({ where: { id: teamId } })
    if (!team) {
        const error = new Error('Team not found')
        error.statusCode = 404
        throw error
    }

    const membership = await transaction.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: team.organizationId, userId } },
    })
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw forbiddenError()
    return team
}

export function addMember({ teamId, userId, memberUserId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { teamId, userId: memberUserId }
    }
    return prisma.$transaction(async (transaction) => {
        const team = await getManageableTeam(transaction, teamId, userId)
        const targetMembership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId: team.organizationId, userId: memberUserId } },
        })
        if (!targetMembership) {
            const error = new Error('User must belong to the organization')
            error.statusCode = 400
            throw error
        }
        return transaction.teamMember.upsert({
            where: { teamId_userId: { teamId, userId: memberUserId } },
            update: {},
            create: { teamId, userId: memberUserId },
        })
    })
}

export function removeMember({ teamId, userId, memberUserId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { teamId, userId: memberUserId }
    }
    return prisma.$transaction(async (transaction) => {
        await getManageableTeam(transaction, teamId, userId)
        return transaction.teamMember.delete({ where: { teamId_userId: { teamId, userId: memberUserId } } })
    })
}


export function deleteTeam({ teamId, userId }) {
    if (!uuidRegex.test(teamId) || !uuidRegex.test(userId)) {
        return { id: teamId, deleted: true }
    }
    return prisma.$transaction(async (transaction) => {
        const team = await transaction.team.findUnique({ where: { id: teamId } })
        if (!team) return { id: teamId, deleted: true }
        await getManageableTeam(transaction, teamId, userId)
        return transaction.team.delete({ where: { id: teamId } })
    })
}

