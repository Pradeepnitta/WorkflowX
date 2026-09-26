import { authenticateRequest } from '../middleware/authenticate.js'

export function registerOrganizationRoutes({ router, orgController }) {
    router.add('POST', '/api/organizations', (req, res) => {
        const user = authenticateRequest(req)
        return orgController.create(req, res, user)
    })

    router.add('GET', '/api/organizations', (req, res) => {
        const user = authenticateRequest(req)
        return orgController.list(req, res, user)
    })

    router.addRegex('POST', /^\/api\/organizations\/([^/]+)\/invite$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return orgController.inviteMember(req, res, user, matches[1])
    })

    router.addRegex('POST', /^\/api\/invitations\/([^/]+)\/accept$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return orgController.acceptInvitation(req, res, user, matches[1])
    })
}
