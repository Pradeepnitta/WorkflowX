import { createRefreshToken, hashRefreshToken } from '../utils/refreshToken.js'

const roles = new Set(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'])
const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export function createInvitationService(invitationRepository) {
    return {
        async create(organizationId, input, userId) {
            const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
            const role = input.role || 'MEMBER'
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!email.includes('@')) throw serviceError('A valid email is required', 400)
            if (!roles.has(role)) throw serviceError('Invalid organization role', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const token = createRefreshToken()
            const invitation = await invitationRepository.createForAdmin({
                email,
                organizationId,
                role,
                tokenHash: hashRefreshToken(token),
                expiresAt: new Date(Date.now() + invitationLifetimeMs),
                userId,
            })
            return { id: invitation.id, email: invitation.email, organizationId, role, expiresAt: invitation.expiresAt, token }
        },
    }
}
