import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAdminRoutes({ router, adminController }) {
    router.get('/api/admin/overview', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.globalOverview(req, res, user)
    })

    router.get('/api/admin/users', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.globalUsers(req, res, user)
    })

    router.patch('/api/admin/users/:userId', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.updateGlobalUser(req, res, user, req.params.userId)
    })

    router.delete('/api/admin/users/:userId', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.deactivateGlobalUser(req, res, user, req.params.userId)
    })

    router.get('/api/admin/audit-logs', async (req, res) => {
        const user = authenticateRequest(req)
        await adminController.auditLogs(req, res, user)
    })

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
