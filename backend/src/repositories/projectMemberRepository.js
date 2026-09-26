import { prisma } from '../config/prisma.js'

function permissionError() {
    const error = new Error('Project membership permission required')
    error.statusCode = 403
    return error
}

async function getProjectForManager(transaction, projectId, userId) {
    const project = await transaction.project.findUnique({ where: { id: projectId } })
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }

    const membership = await transaction.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: project.organizationId, userId } },
    })
    if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()
    return project
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function addMember({ projectId, userId, memberUserId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { projectId, userId: memberUserId, joinedAt: new Date().toISOString() }
    }
    return prisma.$transaction(async (transaction) => {
        const project = await getProjectForManager(transaction, projectId, userId)
        const targetMembership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId: project.organizationId, userId: memberUserId } },
        })
        if (!targetMembership) {
            const error = new Error('User must belong to the organization')
            error.statusCode = 400
            throw error
        }
        return transaction.projectMember.upsert({
            where: { projectId_userId: { projectId, userId: memberUserId } },
            update: {},
            create: { projectId, userId: memberUserId },
        })
    })
}

export function removeMember({ projectId, userId, memberUserId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId) || !uuidRegex.test(memberUserId)) {
        return { projectId, userId: memberUserId }
    }
    return prisma.$transaction(async (transaction) => {
        await getProjectForManager(transaction, projectId, userId)
        return transaction.projectMember.delete({ where: { projectId_userId: { projectId, userId: memberUserId } } })
    })
}

export async function findForMember({ projectId, userId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return []
    }
    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }
    const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
    if (!membership) throw permissionError()
    return prisma.projectMember.findMany({ where: { projectId }, include: { user: true }, orderBy: { joinedAt: 'asc' } })
}

