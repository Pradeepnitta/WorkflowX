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
    throw new Error('AUTH_ACCESS_TOKEN_SECRET must be configured before starting the API')
}

const port = Number(process.env.PORT || 3001)
const app = createApp()

// Pass the Express app to HTTP server for Socket.IO integration
const server = createServer(app)


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

export { app, server }
export default server

