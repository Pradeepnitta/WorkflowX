import { hashPassword } from '../utils/password.js'

const allowedAccountStatuses = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
const allowedSystemRoles = new Set(['USER', 'ADMIN'])
const allowedMembershipRoles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function pageSize(value, fallback = 25) {
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1) return fallback
    return Math.min(parsed, 100)
}

function pageOffset(value) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function parseRegistrationDate(value) {
    if (value === undefined || value === null || value === '') {
        return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) throw serviceError('Registration date filter must be valid', 400)
    return parsed
}

export function createSystemAdminService(systemAdminRepository) {
    async function requireAdmin(actorUserId) {
        if (!actorUserId) throw serviceError('Authentication required', 401)
        await systemAdminRepository.assertSystemAdmin(actorUserId)
    }

    return {
        async overview(actorUserId, input = {}) {
            await requireAdmin(actorUserId)
            return systemAdminRepository.getGlobalOverview({
                registeredSince: parseRegistrationDate(input.registeredSince),
            })
        },

        async users(actorUserId, input = {}) {
            await requireAdmin(actorUserId)
            const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : ''
            const role = typeof input.role === 'string' ? input.role.trim().toUpperCase() : ''
            const accountStatus = typeof input.accountStatus === 'string' ? input.accountStatus.trim().toUpperCase() : ''
            if (role && !allowedMembershipRoles.has(role)) throw serviceError('Invalid role filter', 400)
            if (accountStatus && !allowedAccountStatuses.has(accountStatus)) throw serviceError('Invalid account status filter', 400)
            return systemAdminRepository.listUsers({
                search,
                role,
                accountStatus,
                limit: pageSize(input.limit),
                offset: pageOffset(input.offset),
            })
        },

        async createUser(actorUserId, input = {}) {
            await requireAdmin(actorUserId)
            const name = typeof input.name === 'string' ? input.name.trim() : ''
            const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
            const password = typeof input.password === 'string' ? input.password : ''
            const systemRole = typeof input.systemRole === 'string' ? input.systemRole.trim().toUpperCase() : 'USER'
            const accountStatus = typeof input.accountStatus === 'string' ? input.accountStatus.trim().toUpperCase() : 'ACTIVE'

            if (name.length < 2) throw serviceError('Name must be at least 2 characters', 400)
            if (!emailPattern.test(email)) throw serviceError('A valid email is required', 400)
            if (password.length < 8) throw serviceError('Password must be at least 8 characters', 400)
            if (!allowedSystemRoles.has(systemRole)) throw serviceError('Invalid system role', 400)
            if (!allowedAccountStatuses.has(accountStatus)) throw serviceError('Invalid account status', 400)

            const passwordHash = await hashPassword(password)
            return systemAdminRepository.createUser({
                actorUserId,
                name,
                email,
                passwordHash,
                systemRole,
                accountStatus,
            })
        },

        async updateUser(actorUserId, targetUserId, input = {}) {
            await requireAdmin(actorUserId)
            if (!uuidPattern.test(targetUserId || '')) throw serviceError('User ID must be valid', 400)
            const changes = {}
            if (input.name !== undefined) {
                changes.name = typeof input.name === 'string' ? input.name.trim() : ''
                if (changes.name.length < 2) throw serviceError('Name must be at least 2 characters', 400)
            }
            if (input.email !== undefined) {
                changes.email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
                if (!emailPattern.test(changes.email)) throw serviceError('A valid email is required', 400)
            }
            if (input.systemRole !== undefined) {
                changes.systemRole = typeof input.systemRole === 'string' ? input.systemRole.trim().toUpperCase() : ''
                if (!allowedSystemRoles.has(changes.systemRole)) throw serviceError('Invalid system role', 400)
            }
            if (input.accountStatus !== undefined) {
                changes.accountStatus = typeof input.accountStatus === 'string' ? input.accountStatus.trim().toUpperCase() : ''
                if (!allowedAccountStatuses.has(changes.accountStatus)) throw serviceError('Invalid account status', 400)
            }
            if (Object.keys(changes).length === 0) throw serviceError('At least one account field is required', 400)
            return systemAdminRepository.updateUser({ actorUserId, targetUserId, changes })
        },

        async deactivateUser(actorUserId, targetUserId) {
            await requireAdmin(actorUserId)
            if (!uuidPattern.test(targetUserId || '')) throw serviceError('User ID must be valid', 400)
            return systemAdminRepository.updateUser({
                actorUserId,
                targetUserId,
                changes: { accountStatus: 'INACTIVE' },
            })
        },

        async auditLogs(actorUserId, input = {}) {
            await requireAdmin(actorUserId)
            const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : ''
            const action = typeof input.action === 'string' ? input.action.trim().toUpperCase() : ''
            const resourceType = typeof input.resourceType === 'string' ? input.resourceType.trim().toUpperCase() : ''
            const from = input.from ? new Date(input.from) : null
            const to = input.to ? new Date(input.to) : null
            if (from && Number.isNaN(from.getTime())) throw serviceError('Start date filter must be valid', 400)
            if (to && Number.isNaN(to.getTime())) throw serviceError('End date filter must be valid', 400)

            return systemAdminRepository.listAuditLogs({
                search,
                action,
                resourceType,
                from,
                to,
                limit: pageSize(input.limit, 50),
                offset: pageOffset(input.offset),
            })
        },
    }
}
