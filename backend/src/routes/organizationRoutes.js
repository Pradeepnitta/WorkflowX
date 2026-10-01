import { authenticateRequest } from '../middleware/authenticate.js'

export function registerOrganizationRoutes({ router, orgController }) {
    router.post('/api/organizations', async (req, res) => {
        const user = authenticateRequest(req)
        await orgController.create(req, res, user)
    })

    router.get('/api/organizations', async (req, res) => {
        const user = authenticateRequest(req)
        await orgController.list(req, res, user)
    })

    router.post('/api/organizations/:organizationId/invite', async (req, res) => {
        const user = authenticateRequest(req)
        await orgController.inviteMember(req, res, user, req.params.organizationId)
    })

    router.post('/api/invitations/:token/accept', async (req, res) => {
        const user = authenticateRequest(req)
        await orgController.acceptInvitation(req, res, user, req.params.token)
    })
}
