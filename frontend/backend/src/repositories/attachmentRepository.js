import { prisma } from '../config/prisma.js'

export async function createAttachment(data) {
    return prisma.attachment.create({
        data,
        include: {
            uploadedBy: {
                select: { id: true, name: true, email: true, avatarUrl: true },
            },
        },
    })
}

export async function findAttachmentsByTask(taskId) {
    return prisma.attachment.findMany({
        where: { taskId },
        include: {
            uploadedBy: {
                select: { id: true, name: true, email: true, avatarUrl: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    })
}

export async function findAttachmentById(id) {
    return prisma.attachment.findUnique({
        where: { id },
        include: {
            uploadedBy: {
                select: { id: true, name: true, email: true, avatarUrl: true },
            },
        },
    })
}

export async function deleteAttachment(id) {
    return prisma.attachment.delete({
        where: { id },
    })
}
