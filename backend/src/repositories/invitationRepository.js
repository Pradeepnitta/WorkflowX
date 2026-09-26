import { prisma } from '../config/prisma.js'

export function createForAdmin({ email, organizationId, role, tokenHash, expiresAt, userId }) {
    return prisma.$transaction(async (transaction) => {
        const membership = await transaction.organizationMember.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
        })
        if (!membership || membership.role !== 'ADMIN') {
            const error = new Error('Organization admin permission required')
            error.statusCode = 403
            throw error
        }
        return transaction.invitation.create({ data: { email, organizationId, role, tokenHash, expiresAt } })
    })
}
