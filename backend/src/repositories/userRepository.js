import { prisma } from '../config/prisma.js'

export function findByEmail(email) {
    return prisma.user.findUnique({
        where: { email },
        include: { memberships: true },
    })
}

export function createUser(data) {
    return prisma.user.create({ data })
}

export const create = createUser


export function updateProfile({ userId, name, avatarUrl }) {
    return prisma.user.update({ where: { id: userId }, data: { name, avatarUrl } })
}
