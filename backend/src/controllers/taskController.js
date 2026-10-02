import { createNotification } from '../repositories/notificationRepository.js'
import { query } from '../config/db.js'
import { readTasks } from '../repositories/taskRepository.js'

function isUserAssignee(u, assignee) {
    if (!assignee || assignee === 'Unassigned') return false
    const a = String(assignee).trim().toLowerCase()
    const name = String(u.name || '').trim().toLowerCase()
    const email = String(u.email || '').trim().toLowerCase()
    return a === name || a === email || a.includes(email) || (name && a.includes(name))
}

async function dispatchTaskNotifications({ task, previousTask = null, actor = null, io = null }) {
    try {
        const userRows = (await query(`
            SELECT DISTINCT u.id, u.name, u.email, om.role 
            FROM "User" u 
            LEFT JOIN "OrganizationMember" om ON u.id = om."userId"
        `)).rows

        for (const u of userRows) {
            const role = (u.role || 'MEMBER').toUpperCase()
            const isAssignee = isUserAssignee(u, task.assignee)
            const wasAssignee = previousTask ? isUserAssignee(u, previousTask.assignee) : false

            let type = null
            let message = null

            if (!previousTask) {
                // Task Creation Event
                if (task.isSuggestion || task.approvalStatus === 'PENDING') {
                    if (role === 'MANAGER' || role === 'ADMIN') {
                        type = 'TASK_PROPOSAL'
                        message = `💡 New Task Proposal from ${task.suggestedBy || 'Developer'}: "${task.title}" submitted for review`
                    } else if (isUserAssignee(u, task.suggestedBy)) {
                        type = 'TASK_PROPOSAL'
                        message = `📤 Proposal Submitted: Your task proposal "${task.title}" was submitted for manager review`
                    }
                } else {
                    // Official Task
                    if (isAssignee) {
                        type = 'TASK_ASSIGNED'
                        message = `🎯 Assigned to you: "${task.title}" in ${task.project || 'workspace'} (Priority: ${task.priority || 'Medium'}, Due: ${task.due || 'Next week'})`
                    } else if (role === 'MANAGER') {
                        type = 'TASK_CREATED'
                        message = `📋 Project Task: "${task.title}" assigned to ${task.assignee || 'Unassigned'} in ${task.project || 'workspace'}`
                    } else if (role === 'ADMIN') {
                        type = 'TASK_CREATED'
                        message = `🛡️ Workspace Task: "${task.title}" created in ${task.project || 'workspace'} (Assignee: ${task.assignee || 'Unassigned'})`
                    } else {
                        type = 'TASK_CREATED'
                        message = `📌 New Task: "${task.title}" added to ${task.project || 'workspace'}`
                    }
                }
            } else {
                // Task Update Event
                const statusChanged = previousTask.status !== task.status
                const assigneeChanged = previousTask.assignee !== task.assignee
                const proposalApproved = previousTask.approvalStatus === 'PENDING' && task.approvalStatus === 'APPROVED'

                if (proposalApproved) {
                    if (isAssignee) {
                        type = 'TASK_ASSIGNED'
                        message = `🎉 Proposal Approved & Assigned to You: "${task.title}" in ${task.project} (Priority: ${task.priority})`
                    } else if (role === 'MANAGER' || role === 'ADMIN') {
                        type = 'TASK_APPROVED'
                        message = `✓ Proposal Approved: "${task.title}" approved and assigned to ${task.assignee}`
                    }
                } else if (assigneeChanged) {
                    if (isAssignee) {
                        type = 'TASK_ASSIGNED'
                        message = `🎯 Assigned to you: "${task.title}" in ${task.project || 'workspace'} (Priority: ${task.priority || 'Medium'}, Due: ${task.due || 'Next week'})`
                    } else if (wasAssignee) {
                        type = 'TASK_REASSIGNED'
                        message = `ℹ️ Task Reassigned: "${task.title}" was reassigned to ${task.assignee || 'Unassigned'}`
                    } else if (role === 'MANAGER' || role === 'ADMIN') {
                        type = 'TASK_UPDATED'
                        message = `👤 Assignment Changed: "${task.title}" assigned to ${task.assignee || 'Unassigned'}`
                    }
                } else if (statusChanged) {
                    if (task.status === 'Done') {
                        if (isAssignee) {
                            type = 'TASK_UPDATED'
                            message = `🎉 Completed: Your task "${task.title}" is now marked as Done!`
                        } else if (role === 'MANAGER' || role === 'ADMIN') {
                            type = 'TASK_UPDATED'
                            message = `✅ Task Finished: "${task.title}" (${task.assignee || 'Member'}) moved to Done`
                        }
                    } else if (task.status === 'In Review') {
                        if (isAssignee) {
                            type = 'TASK_UPDATED'
                            message = `🔍 In Review: Your task "${task.title}" was submitted for review`
                        } else if (role === 'MANAGER' || role === 'ADMIN') {
                            type = 'TASK_UPDATED'
                            message = `🔍 Review Needed: "${task.title}" (${task.assignee || 'Developer'}) is ready for review`
                        }
                    } else {
                        if (isAssignee) {
                            type = 'TASK_UPDATED'
                            message = `⚡ Status Update: Your task "${task.title}" moved to ${task.status}`
                        } else if (role === 'MANAGER' || role === 'ADMIN') {
                            type = 'TASK_UPDATED'
                            message = `📊 Progress Update: "${task.title}" (${task.assignee || 'Member'}) is now ${task.status}`
                        }
                    }
                } else {
                    // Other detail changes (priority, due date, etc.)
                    if (isAssignee) {
                        type = 'TASK_UPDATED'
                        message = `📝 Task Details Updated: "${task.title}" (Priority: ${task.priority || 'Medium'}, Due: ${task.due || 'Next week'})`
                    } else if (role === 'MANAGER') {
                        type = 'TASK_UPDATED'
                        message = `📝 Task Updated: "${task.title}" in ${task.project || 'workspace'}`
                    }
                }
            }

            if (type && message) {
                try {
                    const notif = await createNotification({
                        userId: u.id,
                        type,
                        message,
                    })
                    if (io) {
                        io.emit('notification:new', notif)
                    }
                } catch {
                    // Skip single user failure safely
                }
            }
        }
    } catch (dispatchErr) {
        console.error('[TaskNotificationDispatcher] Failed:', dispatchErr)
    }
}

export function createTaskController({ projectTaskService, createTask, listTasks, updateTask, deleteTask, sendJson, readBody, getIO }) {
    return {
        async listProjectTasks(request, response, user, projectId) {
            if (!projectId || projectId === 'undefined') {
                return sendJson(response, 200, { data: [] })
            }
            const data = await projectTaskService.list(projectId, user.sub)
            sendJson(response, 200, { data })
        },

        async createProjectTask(request, response, user) {
            const input = await readBody(request)
            const data = await projectTaskService.create(input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)

            await dispatchTaskNotifications({ task: data, actor: user, io })
            sendJson(response, 201, { data })
        },

        async updateProjectTask(request, response, user, taskId) {
            const input = await readBody(request)
            const data = await projectTaskService.update(taskId, input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)

            await dispatchTaskNotifications({ task: data, actor: user, io })
            sendJson(response, 200, { data })
        },

        async listGeneralTasks(request, response, searchParams) {
            const data = await listTasks(searchParams)
            sendJson(response, 200, data)
        },

        async createGeneralTask(request, response, user = null) {
            const input = await readBody(request)
            const data = await createTask(input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)

            await dispatchTaskNotifications({ task: data, actor: user, io })
            sendJson(response, 201, { data })
        },

        async updateGeneralTask(request, response, taskId, user = null) {
            const input = await readBody(request)
            const tasksList = await readTasks().catch(() => [])
            const previousTask = tasksList.find((t) => String(t.id) === String(taskId)) || null

            const data = await updateTask(taskId, input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)

            await dispatchTaskNotifications({ task: data, previousTask, actor: user, io })
            sendJson(response, 200, { data })
        },

        async deleteGeneralTask(request, response, taskId, user = null) {
            const data = await deleteTask(taskId)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:deleted', { id: taskId })
            sendJson(response, 200, { data })
        },
    }
}

