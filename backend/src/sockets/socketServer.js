import { Server } from 'socket.io'
import { verifyToken } from '../utils/token.js'

let io = null

export function initSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        },
    })

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token
        if (token) {
            try {
                const payload = verifyToken(token)
                socket.user = payload
            } catch {
                socket.user = { sub: 'guest', email: 'guest@workflowx.local' }
            }
        } else {
            socket.user = { sub: 'guest', email: 'guest@workflowx.local' }
        }
        next()
    })

    io.on('connection', (socket) => {
        const userId = socket.user?.sub
        if (userId) {
            socket.join(`user:${userId}`)
        }

        socket.on('join:room', (room) => {
            if (typeof room === 'string' && room.trim().length > 0) {
                socket.join(room)
            }
        })

        socket.on('leave:room', (room) => {
            if (typeof room === 'string') {
                socket.leave(room)
            }
        })

        socket.on('chat:send', (data) => {
            if (data && data.room && data.message) {
                io.to(data.room).emit('chat:message', {
                    id: String(Date.now()),
                    room: data.room,
                    message: data.message,
                    senderId: userId,
                    createdAt: new Date().toISOString(),
                })
            }
        })

        socket.on('disconnect', () => {
            // connection teardown handled automatically by Socket.IO
        })
    })

    return io
}

export function getIO() {
    return io
}

export function broadcastTaskEvent(projectId, eventName, taskData) {
    if (io && projectId) {
        io.to(`project:${projectId}`).emit(eventName, taskData)
    }
}

export function broadcastNotificationEvent(userId, notificationData) {
    if (io && userId) {
        io.to(`user:${userId}`).emit('notification:new', notificationData)
    }
}
