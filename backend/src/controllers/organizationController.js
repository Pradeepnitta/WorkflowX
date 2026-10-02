export function createOrganizationController({ organizationService, invitationService, invitationAcceptanceService, sendJson, readBody, getIO }) {
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
            if (typeof getIO === 'function') {
                const io = getIO()
                if (io) {
                    io.emit('organization:member-added', {
                        organizationId,
                        member: {
                            userId: data.id,
                            name: data.email ? data.email.split('@')[0] : 'New Member',
                            email: data.email,
                            role: data.role || 'MEMBER',
                        },
                    })
                }
            }
            sendJson(response, 201, { data })
        },

        async acceptInvitation(request, response, user, token) {
            const data = await invitationAcceptanceService.accept(token, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
