const validRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export function createOrganizationService(organizationRepository) {
    return {
        async list(userId) {
            if (!userId) throw serviceError('Authentication required', 401)

            const organizations = await organizationRepository.findForUser(userId)
            return organizations.map((organization) => ({
                id: organization.id,
                name: organization.name,
                description: organization.description || null,
                role: organization.role,
            }))
        },

        async create(input, userId) {
            const name = typeof input.name === 'string' ? input.name.trim() : ''
            const description = typeof input.description === 'string' ? input.description.trim() : null

            if (name.length < 2) throw serviceError('Organization name must be at least 2 characters', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const payload = { name, description, userId }
            if (typeof input.role === 'string') {
                payload.role = input.role.trim().toUpperCase()
            }

            const organization = await organizationRepository.createWithAdmin(payload)
            return { id: organization.id, name: organization.name, description: organization.description || null }
        },

        async listMembers(organizationId, userId) {
            if (!organizationId) throw serviceError('Organization ID is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const members = await organizationRepository.findMembers(organizationId)
            return members.map((m) => ({
                userId: m.user.id,
                name: m.user.name,
                email: m.user.email,
                avatarUrl: m.user.avatarUrl || null,
                role: m.role,
                joinedAt: m.joinedAt,
            }))
        },

        async updateMemberRole(organizationId, targetUserId, role, adminUserId) {
            if (!organizationId || !targetUserId) throw serviceError('Organization and target user are required', 400)
            if (!validRoles.has(role)) throw serviceError('Invalid organization role. Must be ADMIN, MANAGER, MEMBER, or VIEWER', 400)
            if (!adminUserId) throw serviceError('Authentication required', 401)

            const updated = await organizationRepository.updateMemberRole({ organizationId, targetUserId, role, adminUserId })
            return {
                userId: updated.userId,
                role: updated.role,
                user: updated.user,
            }
        },

        async removeMember(organizationId, targetUserId, adminUserId) {
            if (!organizationId || !targetUserId) throw serviceError('Organization and target user are required', 400)
            if (!adminUserId) throw serviceError('Authentication required', 401)

            return organizationRepository.removeMember({ organizationId, targetUserId, adminUserId })
        },
    }
}

