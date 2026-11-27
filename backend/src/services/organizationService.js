import { hashPassword } from '../utils/password.js'

const validRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
const validAccountStatuses = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
            const role = typeof input.role === 'string' ? input.role.trim().toUpperCase() : 'ADMIN'

            if (name.length < 2) throw serviceError('Organization name must be at least 2 characters', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            if (!validRoles.has(role)) throw serviceError('Invalid organization role', 400)

            const organization = await organizationRepository.createWithAdmin({ name, description, userId, role })
            return { id: organization.id, name: organization.name, description: organization.description || null }
        },

        async listMembers(organizationId, userId) {
            if (!organizationId) throw serviceError('Organization ID is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const role = await organizationRepository.findMembershipRole(organizationId, userId)
            if (!role) throw serviceError('Organization membership required', 403)
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

        async updateOrganization(organizationId, input = {}, adminUserId) {
            if (!organizationId) throw serviceError('Organization ID is required', 400)
            if (!adminUserId) throw serviceError('Authentication required', 401)

            const changes = {}
            if (input.name !== undefined) {
                changes.name = typeof input.name === 'string' ? input.name.trim() : ''
                if (changes.name.length < 2) throw serviceError('Organization name must be at least 2 characters', 400)
            }
            if (input.description !== undefined) {
                changes.description = typeof input.description === 'string' ? input.description.trim() || null : null
            }
            if (Object.keys(changes).length === 0) throw serviceError('At least one organization field is required', 400)

            return organizationRepository.updateOrganization({ organizationId, adminUserId, changes })
        },

        async createUser(organizationId, input = {}, adminUserId) {
            if (!organizationId) throw serviceError('Organization ID is required', 400)
            if (!adminUserId) throw serviceError('Authentication required', 401)

            const name = typeof input.name === 'string' ? input.name.trim() : ''
            const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
            const password = typeof input.password === 'string' ? input.password : ''
            const role = typeof input.role === 'string' ? input.role.trim().toUpperCase() : 'MEMBER'
            const accountStatus = typeof input.accountStatus === 'string' ? input.accountStatus.trim().toUpperCase() : 'ACTIVE'

            if (name.length < 2) throw serviceError('Full name must be at least 2 characters', 400)
            if (!emailPattern.test(email)) throw serviceError('A valid email address is required', 400)
            if (password.length < 8) throw serviceError('Password must be at least 8 characters', 400)
            if (!validRoles.has(role)) throw serviceError('Invalid organization role', 400)
            if (!validAccountStatuses.has(accountStatus)) throw serviceError('Invalid account status', 400)

            const passwordHash = await hashPassword(password)
            return organizationRepository.createOrgUser({
                organizationId,
                adminUserId,
                name,
                email,
                passwordHash,
                role,
                accountStatus,
            })
        },

        async listAuditLogs(organizationId, adminUserId, input = {}) {
            if (!organizationId) throw serviceError('Organization ID is required', 400)
            if (!adminUserId) throw serviceError('Authentication required', 401)

            const parsedLimit = Number(input.limit)
            const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 100) : 25
            const parsedOffset = Number(input.offset)
            const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0

            const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : ''
            const action = typeof input.action === 'string' ? input.action.trim().toUpperCase() : ''
            const from = input.from ? new Date(input.from) : null
            const to = input.to ? new Date(input.to) : null
            if (from && Number.isNaN(from.getTime())) throw serviceError('Start date filter must be valid', 400)
            if (to && Number.isNaN(to.getTime())) throw serviceError('End date filter must be valid', 400)

            return organizationRepository.listOrgAuditLogs({
                organizationId,
                adminUserId,
                search,
                action,
                from,
                to,
                limit,
                offset,
            })
        },
    }
}

