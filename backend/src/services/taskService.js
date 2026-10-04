import { readTasks, saveTasks } from '../repositories/taskRepository.js'
import { query } from '../config/db.js'

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
    const rawPriority = input.priority || 'Medium'
    const priority = rawPriority.charAt(0).toUpperCase() + rawPriority.slice(1).toLowerCase()

    if (!title) {
        const error = new Error('Task title is required')
        error.statusCode = 400
        throw error
    }
    if (!allowedPriorities.has(priority)) {
        const error = new Error('Priority must be Low, Medium, High, or Critical')
        error.statusCode = 400
        throw error
    }

    const tasks = await readTasks()
    const isSuggestion = Boolean(input.isSuggestion)
    const task = {
        id: Date.now(),
        title,
        description: typeof input.description === 'string' ? input.description.trim() : (input.description || ''),
        project: input.project || 'General',
        status: input.status || 'Todo',
        priority,
        assignee: input.assignee || 'Unassigned',
        due: input.due !== undefined && input.due !== null && input.due !== '' ? input.due : 'No deadline',
        tags: Array.isArray(input.tags) ? input.tags : (input.tags ? String(input.tags).split(',').map(t => t.trim()).filter(Boolean) : []),
        estimatedHours: input.estimatedHours || null,
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
    const targetId = String(id)
    let index = tasks.findIndex((t) => String(t.id) === targetId)

    if (index === -1) {
        try {
            const res = await query(`SELECT * FROM "GeneralTask" WHERE id = $1`, [targetId])
            if (res && res.rows && res.rows[0]) {
                tasks.unshift(res.rows[0])
                index = 0
            }
        } catch {}
    }

    if (index === -1) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }
    const updated = {
        ...tasks[index],
        ...(input.status ? { status: input.status } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
        ...(input.due !== undefined ? { due: input.due || 'No deadline' } : {}),
        ...(input.tags !== undefined ? { tags: Array.isArray(input.tags) ? input.tags : (input.tags ? String(input.tags).split(',').map(t => t.trim()).filter(Boolean) : []) } : {}),
        ...(input.estimatedHours !== undefined ? { estimatedHours: input.estimatedHours } : {}),
        ...(input.isSuggestion !== undefined ? { isSuggestion: input.isSuggestion } : {}),
        ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
        ...(input.suggestedBy ? { suggestedBy: input.suggestedBy } : {}),
        ...(input.suggestionReason ? { suggestionReason: input.suggestionReason } : {}),
        ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
        ...(input.comments !== undefined ? { comments: input.comments } : {}),
    }
    tasks[index] = updated
    await saveTasks(tasks)

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)
    if (isUuid) {
        try {
            const statusMap = { 'Todo': 'TODO', 'In progress': 'IN_PROGRESS', 'Review': 'IN_REVIEW', 'Done': 'COMPLETED' }
            const priorityMap = { 'Low': 'LOW', 'Medium': 'MEDIUM', 'High': 'HIGH', 'Critical': 'URGENT' }
            const pgStatus = statusMap[input.status] || input.status
            const pgPriority = priorityMap[input.priority] || input.priority

            const updates = []
            const values = []
            let paramIdx = 1

            if (input.status) {
                updates.push(`status = $${paramIdx++}`)
                values.push(pgStatus)
            }
            if (input.title) {
                updates.push(`title = $${paramIdx++}`)
                values.push(input.title)
            }
            if (input.description !== undefined) {
                updates.push(`description = $${paramIdx++}`)
                values.push(input.description)
            }
            if (input.priority) {
                updates.push(`priority = $${paramIdx++}`)
                values.push(pgPriority)
            }
            if (updates.length > 0) {
                values.push(targetId)
                await query(`UPDATE "Task" SET ${updates.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $${paramIdx}`, values)
            }
        } catch {
            // ignore
        }
    }

    return updated
}

export async function deleteTask(id) {
    const tasks = await readTasks()
    const targetId = String(id)
    const filtered = tasks.filter((t) => String(t.id) !== targetId)
    const foundInRepo = filtered.length !== tasks.length
    if (foundInRepo) {
        await saveTasks(filtered)
    }

    let pgDeleted = false
    try {
        const res = await query(`DELETE FROM "GeneralTask" WHERE id = $1`, [targetId])
        if (res && res.rowCount > 0) pgDeleted = true
    } catch {
        // Ignore if GeneralTask query fails
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)
    if (isUuid) {
        try {
            const res = await query(`DELETE FROM "Task" WHERE id = $1`, [targetId])
            if (res && res.rowCount > 0) pgDeleted = true
        } catch {
            // Ignore if Task table delete fails
        }
    }

    if (!foundInRepo && !pgDeleted) {
        const error = new Error('Task not found')
        error.statusCode = 404
        throw error
    }
    return { success: true, id: targetId }
}

