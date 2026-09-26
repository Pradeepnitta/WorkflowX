import { authenticateRequest } from '../middleware/authenticate.js'

export function registerSearchRoutes({ router, searchController }) {
    router.add('GET', '/api/search', (req, res, _matches, url) => {
        const user = authenticateRequest(req)
        return searchController.search(req, res, user, url.searchParams.get('organizationId'), url.searchParams.get('q'))
    })
}
