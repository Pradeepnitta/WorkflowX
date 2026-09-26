import { prisma } from '../config/prisma.js'

export async function overview({ organizationId, userId }) {
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
    if (!membership) {
        const error = new Error('Organization membership required')
        error.statusCode = 403
        throw error
    }

    const projects = await prisma.project.count({ where: { organizationId, status: { not: 'ARCHIVED' } } })
    const members = await prisma.organizationMember.count({ where: { organizationId } })
    const tasks = await prisma.task.count({ where: { project: { organizationId } } })
    const completedTasks = await prisma.task.count({ where: { project: { organizationId }, status: 'COMPLETED' } })
    const overdueTasks = await prisma.task.count({ where: { project: { organizationId }, dueDate: { lt: new Date() }, status: { not: 'COMPLETED' } } })

    return { projects, tasks, completedTasks, overdueTasks, members }
}
