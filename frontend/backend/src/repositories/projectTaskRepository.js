import { prisma } from '../config/prisma.js'

function accessError() {
    const error = new Error('Project membership required')
    error.statusCode = 403
    return error
}

async function getProjectAccess(transaction, projectId, userId) {
    const project = await transaction.project.findUnique({ where: { id: projectId } })
    if (!project) {
        const error = new Error('Project not found')
        error.statusCode = 404
        throw error
    }
    const organizationMembership = await transaction.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: project.organizationId, userId } },
    })
    const projectMembership = await transaction.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
    if (!organizationMembership || (!projectMembership && project.visibility === 'MEMBERS_ONLY')) throw accessError()
    return { project, organizationMembership, projectMembership }
}

export function createForProject({ projectId, userId, title, description, status, priority, assigneeId, dueDate }) {
    return prisma.$transaction(async (transaction) => {
        const { organizationMembership } = await getProjectAccess(transaction, projectId, userId)
        if (assigneeId) {
            const isManagerOrAdmin = organizationMembership && ['ADMIN', 'MANAGER'].includes(organizationMembership.role)
            if (!isManagerOrAdmin) {
                const error = new Error('Only Managers and Admins are permitted to assign tasks')
                error.statusCode = 403
                throw error
            }
            const assignee = await transaction.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: assigneeId } } })
            if (!assignee) {
                const error = new Error('Assignee must belong to the project')
                error.statusCode = 400
                throw error
            }
        }
        return transaction.task.create({ data: { title, description, projectId, createdById: userId, assigneeId, status, priority, dueDate } })
    })
}

export async function findForProject({ projectId, userId }) {
    await getProjectAccess(prisma, projectId, userId)
    return prisma.task.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } })
}

export function updateForMember({ taskId, userId, changes }) {
    return prisma.$transaction(async (transaction) => {
        const task = await transaction.task.findUnique({ where: { id: taskId } })
        if (!task) {
            const error = new Error('Task not found')
            error.statusCode = 404
            throw error
        }

        const { organizationMembership } = await getProjectAccess(transaction, task.projectId, userId)
        if (changes.assigneeId !== undefined && changes.assigneeId !== task.assigneeId) {
            const isManagerOrAdmin = organizationMembership && ['ADMIN', 'MANAGER'].includes(organizationMembership.role)
            if (!isManagerOrAdmin) {
                const error = new Error('Only Managers and Admins are permitted to assign or reassign tasks')
                error.statusCode = 403
                throw error
            }
            if (changes.assigneeId) {
                const assignee = await transaction.projectMember.findUnique({
                    where: { projectId_userId: { projectId: task.projectId, userId: changes.assigneeId } },
                })
                if (!assignee) {
                    const error = new Error('Assignee must belong to the project')
                    error.statusCode = 400
                    throw error
                }
            }
        }
        return transaction.task.update({ where: { id: taskId }, data: changes })
    })
}
