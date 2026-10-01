import { authenticateRequest } from '../middleware/authenticate.js'

export function registerNotificationRoutes({ router, notificationController }) {
    router.get('/api/notifications', async (req, res) => {
        const user = authenticateRequest(req)
        await notificationController.list(req, res, user)
    })

    router.patch('/api/notifications/read-all', async (req, res) => {
        const user = authenticateRequest(req)
        await notificationController.markAllRead(req, res, user)
    })

    router.patch('/api/notifications/:notificationId/read', async (req, res) => {
        const user = authenticateRequest(req)
        await notificationController.markRead(req, res, user, req.params.notificationId)
    })

    router.delete('/api/notifications', async (req, res) => {
        const user = authenticateRequest(req)
        await notificationController.clearAll(req, res, user)
    })

    router.delete('/api/notifications/:notificationId', async (req, res) => {
        const user = authenticateRequest(req)
        await notificationController.remove(req, res, user, req.params.notificationId)
    })
}
