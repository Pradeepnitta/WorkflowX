import pg from 'pg'

const { Pool } = pg

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

export function resolveDatabaseUrl() {
    const defaultDbUrl = 'postgresql://workflowx_db_user:Pm2tMq64rUeWah9Qwfj6A7UCXrcowmc2@dpg-darou8d9fdbs73ag117g-a.oregon-postgres.render.com/workflowx_db?sslmode=require'
    let url = process.env.DATABASE_URL
    if (!url || url.includes('localhost') || url.includes('127.0.0.1')) {
        url = defaultDbUrl
    }
    return normalizeDatabaseUrl(url)
}

const globalForDb = globalThis

export const pool = globalForDb.workflowxPool ?? new Pool({
    connectionString: resolveDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
})

globalForDb.workflowxPool = pool

export async function query(text, params) {
    return pool.query(text, params)
}

export async function withTransaction(callback) {
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const result = await callback(client)
        await client.query('COMMIT')
        return result
    } catch (err) {
        await client.query('ROLLBACK')
        throw err
    } finally {
        client.release()
    }
}
