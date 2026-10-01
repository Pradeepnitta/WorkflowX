import { createServer } from 'node:http'
import dns from 'node:dns'

if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first')
}
import { createApp } from './app.js'
import { initSocketServer } from './sockets/socketServer.js'
import { initQueue } from './jobs/taskQueue.js'
import { startWorker } from './jobs/emailWorker.js'

try {
    process.loadEnvFile()
} catch {
    // local .env optional
}
try {
    process.loadEnvFile('../.env')
} catch {
    // parent .env optional
}

if (!process.env.AUTH_ACCESS_TOKEN_SECRET) {
    process.env.AUTH_ACCESS_TOKEN_SECRET = 'workflowx-development-access-token-secret-key-2026'
}
if (!process.env.ADMIN_SECRET_KEY) {
    process.env.ADMIN_SECRET_KEY = 'workflowx-admin-key-2026'
}

const port = Number(process.env.PORT || 3001)
const app = createApp()

// Test route in server.js: server health is ok
const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    if (['/test', '/test-health', '/api/test', '/api/test-health'].includes(url.pathname)) {
        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify({ status: 'ok', message: 'server health is ok' }))
        return
    }
    return app(req, res)
})

initSocketServer(server)
initQueue()
startWorker()

import { pool } from './config/db.js'

async function checkDatabase() {
    try {
        await pool.query('SELECT 1')
        console.log('✅ PostgreSQL database connected successfully')
    } catch (err) {
        console.warn('⚠️ PostgreSQL connection notice:', err.message)
    }
}

server.listen(port, async () => {
    console.log(`🚀 WorkFlowX Backend API running at http://localhost:${port}`)
    console.log('📡 Socket.IO server initialized')
    await checkDatabase()
})

export default server
