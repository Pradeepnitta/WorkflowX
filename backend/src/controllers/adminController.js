export function createAdminController({ organizationService, sendJson, readBody }) {
    return {
        async listMembers(request, response, user, organizationId) {
            const data = await organizationService.listMembers(organizationId, user.sub)
            sendJson(response, 200, { data })
        },

        async updateMemberRole(request, response, user, organizationId, targetUserId) {
            const input = await readBody(request)
            const data = await organizationService.updateMemberRole(organizationId, targetUserId, input.role, user.sub)
            sendJson(response, 200, { data })
        },

        async removeMember(request, response, user, organizationId, targetUserId) {
            const data = await organizationService.removeMember(organizationId, targetUserId, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
