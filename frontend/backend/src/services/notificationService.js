function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentNotification(notification) {
    return { id: notification.id, type: notification.type, message: notification.message, isRead: notification.isRead, createdAt: notification.createdAt }
}

export function createNotificationService(notificationRepository) {
    return {
        async list(userId) {
            if (!userId) throw serviceError('Authentication required', 401)
            const notifications = await notificationRepository.findForUser(userId)
            return notifications.map(presentNotification)
        },

        async markRead(notificationId, userId) {
            if (!notificationId) throw serviceError('Notification is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            await notificationRepository.markRead({ notificationId, userId })
            return { id: notificationId, isRead: true }
        },
    }
}
