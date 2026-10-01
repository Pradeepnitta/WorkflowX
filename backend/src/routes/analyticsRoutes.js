import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAnalyticsRoutes({ router, analyticsController }) {
    router.get('/api/analytics/overview', async (req, res) => {
        const user = authenticateRequest(req)
        await analyticsController.overview(req, res, user, req.query.organizationId)
    })
}
