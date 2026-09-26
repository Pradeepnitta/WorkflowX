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

function resolveDatabaseUrl() {
    const defaultDbUrl = 'postgresql://workflowx_db_user:Pm2tMq64rUeWah9Qwfj6A7UCXrcowmc2@dpg-darou8d9fdbs73ag117g-a.oregon-postgres.render.com/workflowx_db?sslmode=require'
    let url = process.env.DATABASE_URL
    // If not set or points to localhost/127.0.0.1 in cloud environment
    if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
        url = defaultDbUrl
    }
    return normalizeDatabaseUrl(url)
}

const dbUrl = resolveDatabaseUrl()

const globalForPrisma = globalThis

export const prisma = globalForPrisma.workflowxPrisma ?? new PrismaClient({
    datasources: {
        db: {
            url: dbUrl,
        },
    },
})

globalForPrisma.workflowxPrisma = prisma

