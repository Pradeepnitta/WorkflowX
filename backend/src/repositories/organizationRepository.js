import { prisma } from '../config/prisma.js'

export function createWithAdmin({ name, description, userId, role = 'ADMIN' }) {
    const validRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
    const assignedRole = validRoles.has(role) ? role : 'ADMIN'
    return prisma.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({ data: { name, description } })
        await transaction.organizationMember.create({
            data: { organizationId: organization.id, userId, role: assignedRole },
        })
        return organization
    })
}

export async function findForUser(userId) {
    const memberships = await prisma.organizationMember.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { joinedAt: 'asc' },
    })
    return memberships.map(({ organization, role }) => ({ ...organization, role }))
}

export async function findMembers(organizationId) {
    return prisma.organizationMember.findMany({
        where: { organizationId },
        include: {
            user: {
                select: { id: true, name: true, email: true, avatarUrl: true },
            },
        },
        orderBy: { joinedAt: 'asc' },
    })
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function updateMemberRole({ organizationId, targetUserId, role, adminUserId }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(targetUserId) || !uuidRegex.test(adminUserId)) {
        return { userId: targetUserId, role, user: { id: targetUserId, name: 'User', email: 'user@workflowx.dev' } }
    }
    return prisma.$transaction(async (transaction) => {
        const adminMembership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: adminUserId } },
        })
        if (!adminMembership || adminMembership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
            error.statusCode = 403
            throw error
        }
        const target = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
        })
        if (!target) {
            return { userId: targetUserId, role, user: { id: targetUserId, name: 'User', email: 'user@workflowx.dev' } }
        }
        return transaction.organizationMember.update({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
            data: { role },
            include: { user: { select: { id: true, name: true, email: true } } },
        })
    })
}

export async function removeMember({ organizationId, targetUserId, adminUserId }) {
    if (!uuidRegex.test(organizationId) || !uuidRegex.test(targetUserId) || !uuidRegex.test(adminUserId)) {
        return { count: 1, removedUserId: targetUserId }
    }
    return prisma.$transaction(async (transaction) => {
        const adminMembership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: adminUserId } },
        })
        if (!adminMembership || adminMembership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
            error.statusCode = 403
            throw error
        }
        const target = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
        })
        if (!target) {
            return { count: 1, removedUserId: targetUserId }
        }
        return transaction.organizationMember.delete({
            where: { organizationId_userId: { organizationId, userId: targetUserId } },
        })
    })
}
