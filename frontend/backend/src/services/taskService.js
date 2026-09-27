import { readTasks, saveTasks } from '../repositories/taskRepository.js'

const allowedPriorities = new Set(['Low', 'Medium', 'High', 'Critical'])

function matchesFilter(value, filter) {
    return !filter || String(value).toLowerCase() === filter.toLowerCase()
}

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function listTasks(searchParams) {
    const filters = {
        query: searchParams.get('q'),
        status: searchParams.get('status'),
        priority: searchParams.get('priority'),
        assignee: searchParams.get('assignee') || searchParams.get('assigneeId'),
    }
    const page = positiveInteger(searchParams.get('page'), 1)
    const limit = Math.min(100, positiveInteger(searchParams.get('limit'), 20))
    const tasks = await readTasks()
    const filteredTasks = tasks.filter((task) => (
        (!filters.query || [task.title, task.project, task.assignee].some((value) => String(value).toLowerCase().includes(filters.query.toLowerCase())))
        && matchesFilter(task.status, filters.status)
        && matchesFilter(task.priority, filters.priority)
        && matchesFilter(task.assignee, filters.assignee)
    ))
    const start = (page - 1) * limit

    return {
        data: filteredTasks.slice(start, start + limit),
        meta: {
            page,
            limit,
            total: filteredTasks.length,
            totalPages: Math.ceil(filteredTasks.length / limit),
        },
    }
}

export async function createTask(input) {
    const title = typeof input.title === 'string' ? input.title.trim() : ''
    const priority = input.priority || 'Medium'

    if (!title) {
        const error = new Error('Task title is required')
        error.statusCode = 400
        throw error
    }
    if (!allowedPriorities.has(priority)) {
        const error = new Error('Priority must be Low, Medium, or High')
        error.statusCode = 400
        throw error
    }

    const tasks = await readTasks()
    const isSuggestion = Boolean(input.isSuggestion)
    const task = {
        id: Date.now(),
        title,
        project: input.project || 'General',
        status: input.status || 'Todo',
        priority,
        assignee: input.assignee || 'Unassigned',
        due: input.due || 'Next week',
        isSuggestion,
        approvalStatus: input.approvalStatus || (isSuggestion ? 'PENDING' : 'APPROVED'),
        suggestedBy: input.suggestedBy || null,
        suggestionReason: input.suggestionReason || null,
    }
    await saveTasks([task, ...tasks])
    return task
}

export async function updateTask(id, input) {
    const tasks = await readTasks()
    const targetId = Number(id) || String(id)
    const index = tasks.findIndex((t) => t.id === targetId || String(t.id) === String(targetId))
    if (index === -1) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }
    const updated = {
        ...tasks[index],
        ...(input.status ? { status: input.status } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.due ? { due: input.due } : {}),
        ...(input.isSuggestion !== undefined ? { isSuggestion: input.isSuggestion } : {}),
        ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
        ...(input.suggestedBy ? { suggestedBy: input.suggestedBy } : {}),
        ...(input.suggestionReason ? { suggestionReason: input.suggestionReason } : {}),
        ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
    }
    tasks[index] = updated
    await saveTasks(tasks)
    return updated
}

export async function deleteTask(id) {
    const tasks = await readTasks()
    const targetId = Number(id) || String(id)
    const filtered = tasks.filter((t) => t.id !== targetId && String(t.id) !== String(targetId))
    if (filtered.length === tasks.length) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }
    await saveTasks(filtered)
    return { success: true, id: targetId }
}

