import { authenticateRequest } from '../middleware/authenticate.js'

export function registerSearchRoutes({ router, searchController }) {
    router.get('/api/search', async (req, res) => {
        const user = authenticateRequest(req)
        await searchController.search(req, res, user, req.query.organizationId, req.query.q)
    })
}
