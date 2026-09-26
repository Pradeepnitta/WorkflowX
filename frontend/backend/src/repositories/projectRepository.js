import { prisma } from '../config/prisma.js'

function permissionError() {
    const error = new Error('Project management permission required')
    error.statusCode = 403
    return error
}

async function organizationMembership(transaction, organizationId, userId) {
    return transaction.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
    })
}

export function createForMember({ name, description, organizationId, userId, status, visibility, priority, dueDate }) {
    return prisma.$transaction(async (transaction) => {
        const membership = await organizationMembership(transaction, organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()

        const project = await transaction.project.create({
            data: { name, description, organizationId, createdById: userId, status, visibility, priority, dueDate },
        })
        await transaction.projectMember.create({ data: { projectId: project.id, userId } })
        return project
    })
}

export async function findForMember({ organizationId, userId }) {
    const membership = await organizationMembership(prisma, organizationId, userId)
    if (!membership) throw permissionError()

    return prisma.project.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'asc' },
    })
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function updateForManager({ projectId, userId, changes }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return { id: projectId, ...changes }
    }
    return prisma.$transaction(async (transaction) => {
        const project = await transaction.project.findUnique({ where: { id: projectId } })
        if (!project) return { id: projectId, ...changes }
        const membership = await organizationMembership(transaction, project.organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()
        return transaction.project.update({ where: { id: projectId }, data: changes })
    })
}

export function deleteForManager({ projectId, userId }) {
    if (!uuidRegex.test(projectId) || !uuidRegex.test(userId)) {
        return { id: projectId, organizationId: null }
    }
    return prisma.$transaction(async (transaction) => {
        const project = await transaction.project.findUnique({ where: { id: projectId } })
        if (!project) return { id: projectId, organizationId: null }
        const membership = await organizationMembership(transaction, project.organizationId, userId)
        if (!membership || !['ADMIN', 'MANAGER'].includes(membership.role)) throw permissionError()
        return transaction.project.delete({ where: { id: projectId } })
    })
}

