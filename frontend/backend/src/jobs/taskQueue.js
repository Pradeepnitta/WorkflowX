import { Queue } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { processJob } from './emailWorker.js'

let taskQueue = null

export function initQueue() {
    const redis = getRedisClient()
    if (redis) {
        try {
            taskQueue = new Queue('workflowx-notifications', {
                connection: redis,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000,
                    },
                    removeOnComplete: true,
                },
            })
        } catch {
            taskQueue = null
        }
    }
}

export async function enqueueNotificationJob(jobType, payload) {
    if (taskQueue) {
        try {
            await taskQueue.add(jobType, payload)
            return
        } catch {
            // fallback to direct async execution
        }
    }
    // Execute asynchronously in background without blocking API request
    setImmediate(async () => {
        try {
            await processJob({ name: jobType, data: payload })
        } catch (error) {
            console.error(`[Background Job Error] (${jobType}):`, error?.message || error)
        }
    })
}
