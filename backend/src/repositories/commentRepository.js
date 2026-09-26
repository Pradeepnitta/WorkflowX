import { prisma } from '../config/prisma.js'

function accessError() {
    const error = new Error('Project membership required')
    error.statusCode = 403
    return error
}

async function getTaskAccess(transaction, taskId, userId) {
    const task = await transaction.task.findUnique({ where: { id: taskId } })
    if (!task) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }
    const project = await transaction.project.findUnique({ where: { id: task.projectId } })
    const organizationMembership = await transaction.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: project.organizationId, userId } },
    })
    const projectMembership = await transaction.projectMember.findUnique({ where: { projectId_userId: { projectId: task.projectId, userId } } })
    if (!organizationMembership || (!projectMembership && project.visibility === 'MEMBERS_ONLY')) throw accessError()
    return task
}

export function createForTask({ taskId, userId, content, parentId }) {
    return prisma.$transaction(async (transaction) => {
        const task = await getTaskAccess(transaction, taskId, userId)
        if (parentId) {
            const parent = await transaction.comment.findUnique({ where: { id: parentId } })
            if (!parent || parent.taskId !== task.id) {
                const error = new Error('Comment reply must belong to the same task')
                error.statusCode = 400
                throw error
            }
        }
        return transaction.comment.create({
            data: { content, taskId, authorId: userId, parentId },
            include: { author: true },
        })
    })
}

export async function findForTask({ taskId, userId }) {
    await getTaskAccess(prisma, taskId, userId)
    return prisma.comment.findMany({
        where: { taskId },
        include: { author: true },
        orderBy: { createdAt: 'asc' },
    })
}

async function getOwnedComment(transaction, commentId, userId) {
    const comment = await transaction.comment.findUnique({ where: { id: commentId } })
    if (!comment) {
        const error = new Error('Comment not found')
        error.statusCode = 404
        throw error
    }
    await getTaskAccess(transaction, comment.taskId, userId)
    if (comment.authorId !== userId) {
        const error = new Error('Only the comment author can modify it')
        error.statusCode = 403
        throw error
    }
    return comment
}

export function update({ commentId, userId, content }) {
    return prisma.$transaction(async (transaction) => {
        await getOwnedComment(transaction, commentId, userId)
        return transaction.comment.update({ where: { id: commentId }, data: { content }, include: { author: true } })
    })
}

export function remove({ commentId, userId }) {
    return prisma.$transaction(async (transaction) => {
        await getOwnedComment(transaction, commentId, userId)
        return transaction.comment.delete({ where: { id: commentId } })
    })
}
