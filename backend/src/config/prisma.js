import { PrismaClient } from '@prisma/client'

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:Prad6309%40@localhost:5432/mydatabase'

const globalForPrisma = globalThis

export const prisma = globalForPrisma.workflowxPrisma ?? new PrismaClient({
    datasources: {
        db: {
            url: dbUrl,
        },
    },
})

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.workflowxPrisma = prisma
}

