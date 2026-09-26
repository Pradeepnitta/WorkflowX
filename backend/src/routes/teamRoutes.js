import { authenticateRequest } from '../middleware/authenticate.js'

export function registerTeamRoutes({ router, teamController }) {
    router.add('POST', '/api/teams', (req, res) => {
        const user = authenticateRequest(req)
        return teamController.create(req, res, user)
    })

    router.add('GET', '/api/teams', (req, res, _matches, url) => {
        const user = authenticateRequest(req)
        return teamController.list(req, res, user, url.searchParams.get('organizationId'))
    })

    router.addRegex('POST', /^\/api\/teams\/([^/]+)\/members$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return teamController.addMember(req, res, user, matches[1])
    })

    router.addRegex('DELETE', /^\/api\/teams\/([^/]+)\/members\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return teamController.removeMember(req, res, user, matches[1], matches[2])
    })

    router.addRegex('DELETE', /^\/api\/teams\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return teamController.removeTeam(req, res, user, matches[1])
    })
}
