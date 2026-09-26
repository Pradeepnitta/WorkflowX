export function createTeamController({ teamService, sendJson, readBody }) {
    return {
        async list(request, response, user, organizationId) {
            const data = await teamService.list(organizationId, user.sub)
            sendJson(response, 200, { data })
        },

        async create(request, response, user) {
            const input = await readBody(request)
            const data = await teamService.create(input, user.sub)
            sendJson(response, 201, { data })
        },

        async addMember(request, response, user, teamId) {
            const input = await readBody(request)
            const data = await teamService.addMember(teamId, input.userId, user.sub)
            sendJson(response, 201, { data })
        },

        async removeMember(request, response, user, teamId, userId) {
            const data = await teamService.removeMember(teamId, userId, user.sub)
            sendJson(response, 200, { data })
        },

        async removeTeam(request, response, user, teamId) {
            const data = await teamService.removeTeam(teamId, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
