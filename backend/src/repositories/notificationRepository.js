import { prisma } from '../config/prisma.js'

export function createNotification({ userId, type, message }) {
    return prisma.notification.create({
        data: { userId, type, message },
    })
}

export function findForUser(userId) {
    return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
}

export function markRead({ notificationId, userId }) {
    return prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { isRead: true } })
}

