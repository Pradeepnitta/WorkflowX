export function createOrganizationController({ organizationService, invitationService, invitationAcceptanceService, sendJson, readBody }) {
    return {
        async list(request, response, user) {
            const data = await organizationService.list(user.sub)
            sendJson(response, 200, { data })
        },

        async create(request, response, user) {
            const input = await readBody(request)
            const data = await organizationService.create(input, user.sub)
            sendJson(response, 201, { data })
        },

        async inviteMember(request, response, user, organizationId) {
            const input = await readBody(request)
            const data = await invitationService.create(organizationId, input, user.sub)
            sendJson(response, 201, { data })
        },

        async acceptInvitation(request, response, user, token) {
            const data = await invitationAcceptanceService.accept(token, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
