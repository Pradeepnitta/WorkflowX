import { authenticateRequest } from '../middleware/authenticate.js'

export function registerProjectRoutes({ router, projectController }) {
    router.post('/api/projects', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.create(req, res, user)
    })

    router.get('/api/projects', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.list(req, res, user, req.query.organizationId)
    })

    router.patch('/api/projects/:projectId', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.update(req, res, user, req.params.projectId)
    })

    router.delete('/api/projects/:projectId', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.remove(req, res, user, req.params.projectId)
    })

    router.get('/api/projects/:projectId/members', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.listMembers(req, res, user, req.params.projectId)
    })

    router.post('/api/projects/:projectId/members', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.addMember(req, res, user, req.params.projectId)
    })

    router.delete('/api/projects/:projectId/members/:memberId', async (req, res) => {
        const user = authenticateRequest(req)
        await projectController.removeMember(req, res, user, req.params.projectId, req.params.memberId)
    })
}
