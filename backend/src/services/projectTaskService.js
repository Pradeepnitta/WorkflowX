import { broadcastTaskEvent } from '../sockets/socketServer.js'
import { enqueueNotificationJob } from '../jobs/taskQueue.js'

const statuses = new Set(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'COMPLETED'])
const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
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
        dueDate: task.dueDate || null,
    }
}

export function createProjectTaskService(projectTaskRepository) {
    return {
        async create(input, userId) {
            const title = typeof input.title === 'string' ? input.title.trim() : ''
            const description = typeof input.description === 'string' ? input.description.trim() : null
            const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : ''
            const assigneeId = typeof input.assigneeId === 'string' ? input.assigneeId.trim() : null
            const status = input.status || 'TODO'
            const priority = input.priority || 'MEDIUM'
            const dueDate = input.dueDate ? new Date(input.dueDate) : null

            if (!title) throw serviceError('Task title is required', 400)
            if (!projectId) throw serviceError('Project is required', 400)
            if (!statuses.has(status) || !priorities.has(priority)) throw serviceError('Invalid task options', 400)
            if (dueDate && Number.isNaN(dueDate.getTime())) throw serviceError('Due date must be valid', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const createdTask = presentTask(await projectTaskRepository.createForProject({ projectId, userId, title, description, status, priority, assigneeId, dueDate }))

            broadcastTaskEvent(projectId, 'task:created', createdTask)

            if (assigneeId && assigneeId !== userId) {
                enqueueNotificationJob('TASK_ASSIGNED', {
                    userId: assigneeId,
                    taskTitle: createdTask.title,
                    message: `You were assigned task: ${createdTask.title}`,
                })
            }

            return createdTask
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
                if (!statuses.has(input.status)) throw serviceError('Invalid task status', 400)
                changes.status = input.status
            }
            if (input.priority !== undefined) {
                if (!priorities.has(input.priority)) throw serviceError('Invalid task priority', 400)
                changes.priority = input.priority
            }
            if (input.assigneeId !== undefined) changes.assigneeId = input.assigneeId || null
            if (input.dueDate !== undefined) {
                changes.dueDate = input.dueDate ? new Date(input.dueDate) : null
                if (changes.dueDate && Number.isNaN(changes.dueDate.getTime())) throw serviceError('Due date must be valid', 400)
            }
            if (Object.keys(changes).length === 0) throw serviceError('At least one task field is required', 400)

            const updatedTask = presentTask(await projectTaskRepository.updateForMember({ taskId, userId, changes }))

            broadcastTaskEvent(updatedTask.projectId, 'task:updated', updatedTask)

            if (changes.assigneeId && changes.assigneeId !== userId) {
                enqueueNotificationJob('TASK_ASSIGNED', {
                    userId: changes.assigneeId,
                    taskTitle: updatedTask.title,
                    message: `You were assigned task: ${updatedTask.title}`,
                })
            }

            return updatedTask
        },
    }
}

