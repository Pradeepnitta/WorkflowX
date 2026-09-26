import { authenticateRequest } from '../middleware/authenticate.js'

export function registerProjectRoutes({ router, projectController }) {
    router.add('POST', '/api/projects', (req, res) => {
        const user = authenticateRequest(req)
        return projectController.create(req, res, user)
    })

    router.add('GET', '/api/projects', (req, res, _matches, url) => {
        const user = authenticateRequest(req)
        return projectController.list(req, res, user, url.searchParams.get('organizationId'))
    })

    router.addRegex('PATCH', /^\/api\/projects\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return projectController.update(req, res, user, matches[1])
    })

    router.addRegex('DELETE', /^\/api\/projects\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return projectController.remove(req, res, user, matches[1])
    })

    router.addRegex('GET', /^\/api\/projects\/([^/]+)\/members$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return projectController.listMembers(req, res, user, matches[1])
    })

    router.addRegex('POST', /^\/api\/projects\/([^/]+)\/members$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return projectController.addMember(req, res, user, matches[1])
    })

    router.addRegex('DELETE', /^\/api\/projects\/([^/]+)\/members\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return projectController.removeMember(req, res, user, matches[1], matches[2])
    })
}
