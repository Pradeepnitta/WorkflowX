import { prisma } from '../config/prisma.js'
import { hashRefreshToken } from '../utils/refreshToken.js'

export function accept({ token, userId }) {
    return prisma.$transaction(async (transaction) => {
        const invitation = await transaction.invitation.findUnique({ where: { tokenHash: hashRefreshToken(token) } })
        if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt <= new Date()) {
            const error = new Error('Invalid or expired invitation')
            error.statusCode = 400
            throw error
        }

        const user = await transaction.user.findUnique({ where: { id: userId } })
        if (!user || user.email !== invitation.email) {
            const error = new Error('Invitation email does not match the authenticated user')
            error.statusCode = 403
            throw error
        }

        await transaction.organizationMember.upsert({
            where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
            update: { role: invitation.role },
            create: { organizationId: invitation.organizationId, userId, role: invitation.role },
        })
        await transaction.invitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } })
        return invitation
    })
}
