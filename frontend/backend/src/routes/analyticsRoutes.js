import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAnalyticsRoutes({ router, analyticsController }) {
    router.add('GET', '/api/analytics/overview', (req, res, _matches, url) => {
        const user = authenticateRequest(req)
        return analyticsController.overview(req, res, user, url.searchParams.get('organizationId'))
    })
}
