import { Worker } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { createNotification } from '../repositories/notificationRepository.js'
import { broadcastNotificationEvent } from '../sockets/socketServer.js'

export async function processJob(job) {
    const { name, data } = job
    if (name === 'TASK_ASSIGNED' && data?.userId) {
        const message = data.message || `You were assigned task: ${data.taskTitle || 'Untitled Task'}`
        try {
            const notification = await createNotification({
                userId: data.userId,
                type: 'TASK_ASSIGNED',
                message,
            })
            broadcastNotificationEvent(data.userId, notification)
        } catch {
            // Error handling for notifications
        }
    } else if (name === 'DEADLINE_REMINDER' && data?.userId) {
        const message = data.message || `Reminder: Task "${data.taskTitle}" is due soon!`
        try {
            const notification = await createNotification({
                userId: data.userId,
                type: 'DEADLINE_REMINDER',
                message,
            })
            broadcastNotificationEvent(data.userId, notification)
        } catch {
            // Error handling
        }
    }
    return { success: true, processedAt: new Date().toISOString() }
}

export function startWorker() {
    const redis = getRedisClient()
    if (!redis) return null

    try {
        const worker = new Worker(
            'workflowx-notifications',
            async (job) => {
                return await processJob(job)
            },
            { connection: redis }
        )

        worker.on('failed', (job, err) => {
            console.error(`[BullMQ Worker Failed] Job ${job?.id} failed:`, err?.message)
        })

        return worker
    } catch {
        return null
    }
}
