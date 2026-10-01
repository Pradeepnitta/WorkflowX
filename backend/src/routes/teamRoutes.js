import { authenticateRequest } from '../middleware/authenticate.js'

export function registerTeamRoutes({ router, teamController }) {
    router.post('/api/teams', async (req, res) => {
        const user = authenticateRequest(req)
        await teamController.create(req, res, user)
    })

    router.get('/api/teams', async (req, res) => {
        const user = authenticateRequest(req)
        await teamController.list(req, res, user, req.query.organizationId)
    })

    router.post('/api/teams/:teamId/members', async (req, res) => {
        const user = authenticateRequest(req)
        await teamController.addMember(req, res, user, req.params.teamId)
    })

    router.delete('/api/teams/:teamId/members/:memberId', async (req, res) => {
        const user = authenticateRequest(req)
        await teamController.removeMember(req, res, user, req.params.teamId, req.params.memberId)
    })

    router.delete('/api/teams/:teamId', async (req, res) => {
        const user = authenticateRequest(req)
        await teamController.removeTeam(req, res, user, req.params.teamId)
    })
}
