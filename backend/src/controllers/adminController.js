export function createAdminController({ organizationService, systemAdminService, sendJson, readBody }) {
    return {
        async listMembers(request, response, user, organizationId) {
            if (!organizationId || organizationId === 'undefined' || organizationId === 'org-default') {
                return sendJson(response, 200, { data: [] })
            }
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

        async globalOverview(request, response, user) {
            const data = await systemAdminService.overview(user.sub, {
                registeredSince: request.query?.registeredSince,
            })
            sendJson(response, 200, { data })
        },

        async globalUsers(request, response, user) {
            const data = await systemAdminService.users(user.sub, {
                search: request.query?.search,
                role: request.query?.role,
                accountStatus: request.query?.accountStatus,
                limit: request.query?.limit,
                offset: request.query?.offset,
            })
            sendJson(response, 200, { data })
        },

        async updateGlobalUser(request, response, user, targetUserId) {
            const input = await readBody(request)
            const data = await systemAdminService.updateUser(user.sub, targetUserId, input)
            sendJson(response, 200, { data })
        },

        async deactivateGlobalUser(request, response, user, targetUserId) {
            const data = await systemAdminService.deactivateUser(user.sub, targetUserId)
            sendJson(response, 200, { data })
        },

        async auditLogs(request, response, user) {
            const data = await systemAdminService.auditLogs(user.sub, {
                limit: request.query?.limit,
                offset: request.query?.offset,
            })
            sendJson(response, 200, { data })
        },
    }
}
