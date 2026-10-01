import { createNotification } from '../repositories/notificationRepository.js'
import { query } from '../config/db.js'

export function createTaskController({ projectTaskService, createTask, listTasks, updateTask, deleteTask, sendJson, readBody, getIO }) {
    return {
        async listProjectTasks(request, response, user, projectId) {
            const data = await projectTaskService.list(projectId, user.sub)
            sendJson(response, 200, { data })
        },

        async createProjectTask(request, response, user) {
            const input = await readBody(request)
            const data = await projectTaskService.create(input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)
            sendJson(response, 201, { data })
        },

        async updateProjectTask(request, response, user, taskId) {
            const input = await readBody(request)
            const data = await projectTaskService.update(taskId, input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)
            sendJson(response, 200, { data })
        },

        async listGeneralTasks(request, response, searchParams) {
            const data = await listTasks(searchParams)
            sendJson(response, 200, data)
        },

        async createGeneralTask(request, response) {
            const input = await readBody(request)
            const data = await createTask(input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)

            // Persist in-app notifications for workspace members
            try {
                const userRows = (await query(`SELECT DISTINCT u.id, om.role FROM "User" u LEFT JOIN "OrganizationMember" om ON u.id = om."userId"`)).rows
                for (const u of userRows) {
                    const msg = data.isSuggestion
                        ? `New Task Proposal: "${data.title}" submitted for manager review`
                        : `New Task: "${data.title}" added to ${data.project || 'workspace'}`
                    const notif = await createNotification({
                        userId: u.id,
                        type: 'TASK_ASSIGNED',
                        message: msg,
                    })
                    if (io) io.emit('notification:new', notif)
                }
            } catch {
                // Silently handle if notification dispatch fails
            }

            sendJson(response, 201, { data })
        },

        async updateGeneralTask(request, response, taskId) {
            const input = await readBody(request)
            const data = await updateTask(taskId, input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)

            // Persist in-app notifications for task status or details update
            try {
                const userRows = (await query(`SELECT DISTINCT u.id FROM "User" u`)).rows
                for (const u of userRows) {
                    const notif = await createNotification({
                        userId: u.id,
                        type: 'TASK_UPDATED',
                        message: `Task updated: "${data.title || 'Task'}" status is now ${data.status || 'updated'}`,
                    })
                    if (io) io.emit('notification:new', notif)
                }
            } catch {
                // Silently handle if notification dispatch fails
            }

            sendJson(response, 200, { data })
        },

        async deleteGeneralTask(request, response, taskId) {
            const data = await deleteTask(taskId)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:deleted', { id: taskId })
            sendJson(response, 200, { data })
        },
    }
}

