import { prisma } from '../config/prisma.js'

export function create(data) {
    return prisma.refreshToken.create({ data })
}

export function findActiveByHash(tokenHash) {
    return prisma.refreshToken.findFirst({
        where: {
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        include: { user: true },
    })
}

export function revoke(id) {
    return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } })
}
