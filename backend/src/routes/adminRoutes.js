import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAdminRoutes({ router, adminController }) {
    router.get('/api/organizations/:organizationId/members', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.listMembers(req, res, user, req.params.organizationId)
    })

    router.patch('/api/organizations/:organizationId/members/:memberId/role', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.updateMemberRole(req, res, user, req.params.organizationId, req.params.memberId)
    })

    router.delete('/api/organizations/:organizationId/members/:memberId', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.removeMember(req, res, user, req.params.organizationId, req.params.memberId)
    })
}
