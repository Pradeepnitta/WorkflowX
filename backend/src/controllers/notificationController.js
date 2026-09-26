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
    }
}
