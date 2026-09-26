import { PrismaClient } from '@prisma/client'

function normalizeDatabaseUrl(url) {
    if (!url) return url
    // If it's a Render internal Postgres hostname (dpg-xxxx), convert to external domain when accessed outside Render
    let normalized = url.replace(/@(dpg-[a-z0-9-]+)(:\d+)?\//i, (match, host, port) => {
        return '@' + host + '.oregon-postgres.render.com' + (port || '') + '/'
    })
    if (!normalized.includes('sslmode=') && normalized.includes('render.com')) {
        normalized += (normalized.includes('?') ? '&' : '?') + 'sslmode=require'
    }
    return normalized
}

const rawDbUrl = process.env.DATABASE_URL || 'postgresql://postgres:Prad6309%40@localhost:5432/mydatabase'
const dbUrl = normalizeDatabaseUrl(rawDbUrl)

const globalForPrisma = globalThis

export const prisma = globalForPrisma.workflowxPrisma ?? new PrismaClient({
    datasources: {
        db: {
            url: dbUrl,
        },
    },
})

globalForPrisma.workflowxPrisma = prisma

