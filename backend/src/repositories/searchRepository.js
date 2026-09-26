import { prisma } from '../config/prisma.js'

export async function search({ organizationId, userId, query }) {
    const membership = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
    if (!membership) {
        const error = new Error('Organization membership required')
        error.statusCode = 403
        throw error
    }
    const contains = { contains: query, mode: 'insensitive' }
    const [projects, tasks, comments, users] = await Promise.all([
        prisma.project.findMany({ where: { organizationId, OR: [{ name: contains }, { description: contains }] }, take: 20 }),
        prisma.task.findMany({ where: { project: { organizationId }, OR: [{ title: contains }, { description: contains }] }, take: 20 }),
        prisma.comment.findMany({ where: { task: { project: { organizationId } }, content: contains }, take: 20 }),
        prisma.user.findMany({ where: { memberships: { some: { organizationId } }, OR: [{ name: contains }, { email: contains }] }, take: 20 }),
    ])
    return {
        projects: projects.map(({ id, name, status }) => ({ id, name, status })),
        tasks: tasks.map(({ id, title, status, priority, projectId }) => ({ id, title, status, priority, projectId })),
        comments: comments.map(({ id, content, taskId, authorId }) => ({ id, content, taskId, authorId })),
        users: users.map(({ id, name, email }) => ({ id, name, email })),
    }
}
