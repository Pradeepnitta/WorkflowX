import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAdminRoutes({ router, adminController }) {
    router.addRegex('GET', /^\/api\/organizations\/([^/]+)\/members$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return adminController.listMembers(req, res, user, matches[1])
    })

    router.addRegex('PATCH', /^\/api\/organizations\/([^/]+)\/members\/([^/]+)\/role$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return adminController.updateMemberRole(req, res, user, matches[1], matches[2])
    })

    router.addRegex('DELETE', /^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return adminController.removeMember(req, res, user, matches[1], matches[2])
    })
}
