import { Queue } from 'bullmq'
import { getRedisClient } from '../config/redis.js'
import { processJob } from './emailWorker.js'

let taskQueue = null
const fallbackTimers = new Map()
const maxTimerDelay = 2 ** 31 - 1

function clearFallbackTimer(jobId) {
    if (!jobId) return
    const timer = fallbackTimers.get(jobId)
    if (timer) clearTimeout(timer)
    fallbackTimers.delete(jobId)
}

function scheduleFallbackJob(jobType, payload, jobId, runAt) {
    clearFallbackTimer(jobId)
    const remaining = Math.max(0, runAt - Date.now())
    const timer = setTimeout(() => {
        if (Date.now() < runAt) {
            scheduleFallbackJob(jobType, payload, jobId, runAt)
            return
        }
        fallbackTimers.delete(jobId)
        processJob({ name: jobType, data: payload }).catch((error) => {
            console.error(`[Background Job Error] (${jobType}):`, error?.message || error)
        })
    }, Math.min(remaining, maxTimerDelay))
    timer.unref?.()
    fallbackTimers.set(jobId, timer)
}

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
        } catch (error) {
            taskQueue = null
            console.error('[Notification Queue Error] Unable to initialize BullMQ:', error?.message || error)
        }
    }
}

export async function enqueueNotificationJob(jobType, payload, options = {}) {
    const jobId = options.jobId
    clearFallbackTimer(jobId)
    if (taskQueue) {
        try {
            await taskQueue.add(jobType, payload, options)
            return
        } catch (error) {
            console.error(`[Notification Queue Error] Unable to enqueue ${jobType}:`, error?.message || error)
        }
    }
    if (options.delay > 0) {
        scheduleFallbackJob(jobType, payload, jobId, Date.now() + options.delay)
        return
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

export async function cancelNotificationJob(jobId) {
    clearFallbackTimer(jobId)
    if (!taskQueue || !jobId) return
    try {
        const job = await taskQueue.getJob(jobId)
        if (job) await job.remove()
    } catch (error) {
        console.error(`[Notification Queue Error] Unable to cancel ${jobId}:`, error?.message || error)
    }
}

function taskDeadlineJobIds(taskId) {
    return [`deadline-reminder-${taskId}`, `task-overdue-${taskId}`]
}

export async function cancelTaskDeadlineNotifications(taskId) {
    await Promise.all(taskDeadlineJobIds(taskId).map(cancelNotificationJob))
}

export function getTaskDeadlineJobs(task, now = Date.now()) {
    if (!task?.id || !task.dueDate || !['TODO', 'IN_PROGRESS'].includes(task.status)) return []
    const dueAt = new Date(task.dueDate).getTime()
    if (Number.isNaN(dueAt)) return []

    const userIds = [...new Set([task.assigneeId, task.createdById].filter(Boolean))]
    if (userIds.length === 0) return []

    const jobs = []
    if (dueAt > now) {
        jobs.push({
            name: 'DEADLINE_REMINDER',
            jobId: taskDeadlineJobIds(task.id)[0],
            delay: Math.max(0, dueAt - 24 * 60 * 60 * 1000 - now),
            payload: {
                userIds,
                taskId: task.id,
                taskTitle: task.title,
                dueDate: task.dueDate,
            },
        })
    }
    jobs.push({
        name: 'TASK_OVERDUE',
        jobId: taskDeadlineJobIds(task.id)[1],
        delay: Math.max(0, dueAt - now),
        payload: {
            userIds,
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.dueDate,
        },
    })
    return jobs
}

export async function scheduleTaskDeadlineNotifications(task) {
    if (!task?.id) return
    await cancelTaskDeadlineNotifications(task.id)
    const jobs = getTaskDeadlineJobs(task)
    for (const job of jobs) {
        await enqueueNotificationJob(job.name, job.payload, {
            jobId: job.jobId,
            delay: job.delay,
            removeOnComplete: true,
        })
    }
}
