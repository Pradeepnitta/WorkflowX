export function createNotificationController({ notificationService, sendJson }) {
    return {
        async list(request, response, user) {
            const data = await notificationService.list(user.sub)
            sendJson(response, 200, { data })
        },

        async markRead(request, response, user, notificationId) {
            const data = await notificationService.markRead(notificationId, user.sub)
            sendJson(response, 200, { data })
        },

        async markUnread(request, response, user, notificationId) {
            const data = await notificationService.markUnread(notificationId, user.sub)
            sendJson(response, 200, { data })
        },

        async markAllRead(request, response, user) {
            const data = await notificationService.markAllRead(user.sub)
            sendJson(response, 200, { data })
        },

        async remove(request, response, user, notificationId) {
            const data = await notificationService.remove(notificationId, user.sub)
            sendJson(response, 200, { data })
        },

        async clearAll(request, response, user) {
            const data = await notificationService.clearAll(user.sub)
            sendJson(response, 200, { data })
        },

        async clearRead(request, response, user) {
            const data = await notificationService.clearRead(user.sub)
            sendJson(response, 200, { data })
        },
    }
}
