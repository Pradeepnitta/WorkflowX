import { Server } from 'socket.io'
import { verifyToken } from '../utils/token.js'
import { query } from '../config/db.js'

let io = null
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function initSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
        },
    })

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token
        if (!token) return next(new Error('Authentication required'))
        try {
            const payload = verifyToken(token)
            if (!payload.sub) return next(new Error('Invalid access token'))
            socket.user = payload
        } catch {
            return next(new Error('Invalid or expired access token'))
        }
        next()
    })

    io.on('connection', (socket) => {
        const userId = socket.user?.sub
        if (userId) {
            socket.join(`user:${userId}`)
        }

        socket.on('join:room', async (room, acknowledge) => {
            const userId = socket.user?.sub
            if (typeof room !== 'string' || !userId) return
            const organizationMatch = room.match(/^organization:([0-9a-f-]{36})$/i)
            const projectMatch = room.match(/^project:([0-9a-f-]{36})$/i)
            const userMatch = room.match(/^user:([0-9a-f-]{36})$/i)
            try {
                if (userMatch && userMatch[1] === userId && uuidRegex.test(userMatch[1])) {
                    await socket.join(room)
                } else if (organizationMatch && uuidRegex.test(organizationMatch[1])) {
                    const membership = await query(
                        `SELECT 1 FROM "OrganizationMember" WHERE "organizationId" = $1 AND "userId" = $2`,
                        [organizationMatch[1], userId]
                    )
                    if (membership.rows.length > 0) await socket.join(room)
                } else if (projectMatch && uuidRegex.test(projectMatch[1])) {
                    const access = await query(
                        `SELECT p.visibility, om.role,
                                EXISTS (
                                    SELECT 1 FROM "ProjectMember" pm
                                    WHERE pm."projectId" = p.id AND pm."userId" = $2
                                ) AS "isProjectMember"
                         FROM "Project" p
                         JOIN "OrganizationMember" om
                           ON om."organizationId" = p."organizationId" AND om."userId" = $2
                         WHERE p.id = $1`,
                        [projectMatch[1], userId]
                    )
                    const project = access.rows[0]
                    if (project && (
                        project.role === 'ADMIN'
                        || project.visibility !== 'MEMBERS_ONLY'
                        || project.isProjectMember
                    )) {
                        await socket.join(room)
                    }
                }
                if (typeof acknowledge === 'function') acknowledge(socket.rooms.has(room))
            } catch (error) {
                console.error('[Socket] Room authorization failed:', error.message)
                if (typeof acknowledge === 'function') acknowledge(false)
            }
        })

        socket.on('leave:room', (room) => {
            if (typeof room === 'string' && socket.rooms.has(room)) {
                socket.leave(room)
            }
        })

        socket.on('chat:send', (data) => {
            if (data && data.room && data.message && socket.rooms.has(data.room)) {
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

export async function broadcastTaskEvent(projectId, eventName, taskData) {
    if (!io || !projectId) return

    try {
        const taskId = taskData?.taskId || taskData?.id
        let assigneeId = taskData?.assigneeId || null
        let createdById = taskData?.createdById || null

        if (taskId && (!assigneeId || !createdById)) {
            const task = await query(
                `SELECT "assigneeId", "createdById" FROM "Task" WHERE id = $1`,
                [taskId]
            )
            assigneeId = assigneeId || task.rows[0]?.assigneeId || null
            createdById = createdById || task.rows[0]?.createdById || null
        }

        const managers = await query(
            `SELECT DISTINCT om."userId"
             FROM "Project" p
             JOIN "OrganizationMember" om ON om."organizationId" = p."organizationId"
             LEFT JOIN "ProjectMember" pm ON pm."projectId" = p.id AND pm."userId" = om."userId"
             WHERE p.id = $1
               AND (
                   om.role = 'ADMIN'
                   OR (om.role = 'MANAGER' AND (p."createdById" = om."userId" OR pm."userId" IS NOT NULL))
               )`,
            [projectId]
        )
        const recipients = new Set([
            assigneeId,
            createdById,
            taskData?.comment?.authorId,
            ...managers.rows.map((row) => row.userId),
        ].filter(Boolean))

        for (const recipientId of recipients) {
            io.to(`user:${recipientId}`).emit(eventName, taskData)
        }
    } catch (error) {
        console.error('[Socket] Task event delivery failed:', error.message)
    }
}

export function broadcastNotificationEvent(userId, notificationData) {
    if (io && userId) {
        io.to(`user:${userId}`).emit('notification:new', notificationData)
    }
}
