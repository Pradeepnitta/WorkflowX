import { authenticateRequest } from '../middleware/authenticate.js'

export function registerNotificationRoutes({ router, notificationController }) {
    router.add('GET', '/api/notifications', (req, res) => {
        const user = authenticateRequest(req)
        return notificationController.list(req, res, user)
    })

    router.addRegex('PATCH', /^\/api\/notifications\/([^/]+)\/read$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return notificationController.markRead(req, res, user, matches[1])
    })
}
