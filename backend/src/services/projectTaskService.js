import { broadcastNotificationEvent, broadcastTaskEvent } from '../sockets/socketServer.js'
import {
    cancelTaskDeadlineNotifications,
    enqueueNotificationJob,
    scheduleTaskDeadlineNotifications,
} from '../jobs/taskQueue.js'

const statuses = new Set(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'])
const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
const priorityAliases = { CRITICAL: 'URGENT' }
const reviewDecisions = {
    APPROVE: 'APPROVED',
    APPROVED: 'APPROVED',
    REJECT: 'REJECTED',
    REJECTED: 'REJECTED',
    REQUEST_CHANGES: 'CHANGES_REQUESTED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
}

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function parseDate(value, label) {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw serviceError(`${label} must be valid`, 400)
    return date
}

function parseProgress(value) {
    const progress = Number(value)
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        throw serviceError('Progress must be an integer between 0 and 100', 400)
    }
    return progress
}

function presentTask(task) {
    return {
        id: task.id,
        title: task.title,
        description: task.description || null,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        assigneeId: task.assigneeId || null,
        createdById: task.createdById,
        startDate: task.startDate || null,
        dueDate: task.dueDate || null,
        teamId: task.teamId || null,
        progress: Number(task.progress || 0),
        completedAt: task.completedAt || null,
        review: task.reviewStatus ? {
            status: task.reviewStatus,
            submittedAt: task.submittedAt || null,
            submissionDetails: task.submissionDetails || null,
            submittedById: task.submittedById || null,
            submitterName: task.submitterName || null,
            reviewedById: task.reviewedById || null,
            reviewerName: task.reviewerName || null,
            reviewedAt: task.reviewedAt || null,
            feedback: task.reviewFeedback || null,
        } : null,
    }
}

function presentNotifications(notifications = []) {
    for (const notification of notifications) {
        broadcastNotificationEvent(notification.userId, notification)
    }
}

async function presentTaskEvent(task, eventName) {
    if (task?.projectId) await broadcastTaskEvent(task.projectId, eventName, presentTask(task))
}

export function createProjectTaskService(
    projectTaskRepository,
    taskDeadlineScheduler = {
        schedule: scheduleTaskDeadlineNotifications,
        cancel: cancelTaskDeadlineNotifications,
    },
) {
    return {
        async create(input, userId) {
            const title = typeof input.title === 'string' ? input.title.trim() : ''
            const description = typeof input.description === 'string' ? input.description.trim() : null
            const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
            const assigneeId = typeof input.assigneeId === 'string' && input.assigneeId.trim() ? input.assigneeId.trim() : null
            const status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : 'TODO'
            const rawPriority = typeof input.priority === 'string' ? input.priority.trim().toUpperCase() : 'MEDIUM'
            const priority = priorityAliases[rawPriority] || rawPriority
            const startDate = parseDate(input.startDate, 'Start date')
            const dueDate = parseDate(input.dueDate, 'Due date')
            const teamId = typeof input.teamId === 'string' && input.teamId.trim() ? input.teamId.trim() : null
            const progress = input.progress === undefined ? 0 : parseProgress(input.progress)

            if (!title) throw serviceError('Task title is required', 400)
            if (!projectId) throw serviceError('Project is required', 400)
            if (!statuses.has(status) || !priorities.has(priority)) throw serviceError('Invalid task options', 400)
            if (startDate && dueDate && dueDate < startDate) {
                throw serviceError('Due date cannot be earlier than the start date', 400)
            }
            if (!userId) throw serviceError('Authentication required', 401)

            const task = presentTask(await projectTaskRepository.createForProject({
                projectId,
                userId,
                title,
                description,
                status,
                priority,
                assigneeId,
                startDate,
                dueDate,
                teamId,
                progress,
            }))
            await presentTaskEvent(task, 'task:created')
            await taskDeadlineScheduler.schedule(task)

            if (assigneeId && assigneeId !== userId) {
                enqueueNotificationJob('TASK_ASSIGNED', {
                    userId: assigneeId,
                    taskTitle: task.title,
                    message: `You were assigned task: ${task.title}`,
                })
            }
            return task
        },

        async list(projectId, userId) {
            if (!projectId) throw serviceError('Project is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const tasks = await projectTaskRepository.findForProject({ projectId, userId })
            return tasks.map(presentTask)
        },

        async update(taskId, input, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const changes = {}
            if (input.title !== undefined) {
                changes.title = typeof input.title === 'string' ? input.title.trim() : ''
                if (!changes.title) throw serviceError('Task title is required', 400)
            }
            if (input.description !== undefined) changes.description = typeof input.description === 'string' ? input.description.trim() : null
            if (input.status !== undefined) {
                changes.status = typeof input.status === 'string' ? input.status.trim().toUpperCase() : ''
                if (!statuses.has(changes.status)) throw serviceError('Invalid task status', 400)
                if (changes.status === 'IN_REVIEW') {
                    throw serviceError('Submit the task for review using the review workflow', 400)
                }
            }
            if (input.priority !== undefined) {
                const rawPriority = typeof input.priority === 'string' ? input.priority.trim().toUpperCase() : ''
                changes.priority = priorityAliases[rawPriority] || rawPriority
                if (!priorities.has(changes.priority)) throw serviceError('Invalid task priority', 400)
            }
            if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId || null
            if (input.startDate !== undefined) changes.startDate = parseDate(input.startDate, 'Start date')
            if (input.dueDate !== undefined) changes.dueDate = parseDate(input.dueDate, 'Due date')
            if (input.teamId !== undefined) changes.teamId = input.teamId || null
            if (input.progress !== undefined) changes.progress = parseProgress(input.progress)
            if (Object.keys(changes).length === 0) throw serviceError('At least one task field is required', 400)
            if (changes.startDate && changes.dueDate && changes.dueDate < changes.startDate) {
                throw serviceError('Due date cannot be earlier than the start date', 400)
            }

            const task = presentTask(await projectTaskRepository.updateForMember({ taskId, userId, changes }))
            await presentTaskEvent(task, 'task:updated')
            if (changes.dueDate !== undefined || changes.assigneeId !== undefined || changes.status !== undefined) {
                await taskDeadlineScheduler.schedule(task)
            }
            return task
        },

        async remove(taskId, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const result = await projectTaskRepository.deleteForManager({ taskId, userId })
            await taskDeadlineScheduler.cancel(taskId)
            if (result.projectId) {
                await broadcastTaskEvent(result.projectId, 'task:deleted', result)
            }
            return result
        },

        async submitForReview(taskId, input, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const submissionDetails = typeof input.submissionDetails === 'string' ? input.submissionDetails.trim() : ''
            if (!submissionDetails) throw serviceError('A completion summary is required', 400)
            const result = await projectTaskRepository.submitForReview({ taskId, userId, submissionDetails })
            const task = presentTask(result.task)
            await presentTaskEvent(task, 'task:updated')
            await taskDeadlineScheduler.schedule(task)
            presentNotifications(result.notifications)
            return task
        },

        async review(taskId, input, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const action = typeof input.action === 'string' ? input.action.trim().toUpperCase() : ''
            const decision = reviewDecisions[action]
            const feedback = typeof input.feedback === 'string' ? input.feedback.trim() : ''
            if (!decision) throw serviceError('Review action must be approve, reject, or request_changes', 400)
            if (decision !== 'APPROVED' && !feedback) {
                throw serviceError('Feedback is required when rejecting or requesting changes', 400)
            }

            const result = await projectTaskRepository.reviewTask({
                taskId,
                userId,
                decision,
                feedback: feedback || null,
            })
            const task = presentTask(result.task)
            await presentTaskEvent(task, 'task:updated')
            await taskDeadlineScheduler.schedule(task)
            presentNotifications(result.notifications)
            return task
        },

        async reviews(taskId, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            return projectTaskRepository.findReviews({ taskId, userId })
        },
    }
}
