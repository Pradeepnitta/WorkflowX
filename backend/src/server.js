import { createServer } from 'node:http'
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
const server = createServer(createApp())

initSocketServer(server)
initQueue()
startWorker()

server.listen(port, () => {
    console.log(`🚀 WorkFlowX Backend API running at http://localhost:${port}`)
    console.log('📡 Socket.IO server initialized')
})

