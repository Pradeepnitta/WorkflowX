import { Worker } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { createNotification } from '../repositories/notificationRepository.js'
import { broadcastNotificationEvent } from '../sockets/socketServer.js'

export async function processJob(job) {
    const { name, data } = job
    const notificationType = {
        TASK_ASSIGNED: 'TASK_ASSIGNED',
        DEADLINE_REMINDER: 'DEADLINE_REMINDER',
        TASK_OVERDUE: 'TASK_OVERDUE',
    }[name]
    if (!notificationType) return { success: true, processedAt: new Date().toISOString() }

    if (!data || typeof data !== 'object') {
        throw new Error(`Notification job ${name} requires a payload`)
    }
    const userIds = [...new Set([
        ...(Array.isArray(data?.userIds) ? data.userIds : []),
        data?.userId,
    ].filter(Boolean))]
    if (userIds.length === 0) {
        throw new Error(`Notification job ${name} requires at least one recipient`)
    }
    for (const userId of userIds) {
        const message = data?.message || (
            name === 'TASK_ASSIGNED'
                ? `You were assigned task: ${data.taskTitle || 'Untitled Task'}`
                : name === 'DEADLINE_REMINDER'
                    ? `Reminder: Task "${data.taskTitle || 'Untitled Task'}" is due soon.`
                    : `Task "${data.taskTitle || 'Untitled Task'}" is overdue.`
        )
        const notification = await createNotification({
            userId,
            type: notificationType,
            message,
        })
        broadcastNotificationEvent(userId, notification)
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
    } catch (error) {
        console.error('[Notification Worker Error] Unable to initialize BullMQ worker:', error?.message || error)
        return null
    }
}
