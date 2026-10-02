import { authenticatedRequest } from './authService.js'

const TASKS_CACHE_KEY = 'workflowx_cached_tasks'

function getCachedTasks() {
    try {
        const stored = window.localStorage.getItem(TASKS_CACHE_KEY)
        return stored ? JSON.parse(stored) : []
    } catch {
        return []
    }
}

function setCachedTasks(tasks) {
    try {
        window.localStorage.setItem(TASKS_CACHE_KEY, JSON.stringify(tasks))
    } catch {
        // ignore
    }
}

export async function getTasks() {
    try {
        const payload = await authenticatedRequest('/api/tasks')
        const tasks = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : []
        if (tasks && tasks.length > 0) {
            setCachedTasks(tasks)
            return tasks
        }
        // If server returns empty list, also check if cached tasks exist to avoid flickering
        const cached = getCachedTasks()
        return cached.length > 0 ? cached : tasks
    } catch (err) {
        console.warn('[TaskService] getTasks error, using cached fallback:', err.message)
        return getCachedTasks()
    }
}

export async function createTask(input) {
    try {
        const payload = await authenticatedRequest('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(input),
        })
        const task = payload?.data || payload
        if (task && task.id) {
            const cached = getCachedTasks()
            setCachedTasks([task, ...cached.filter((t) => t.id !== task.id && String(t.id) !== String(task.id))])
        }
        return task
    } catch (err) {
        console.error('[TaskService] createTask error:', err)
        throw err
    }
}

export async function updateTaskStatus(taskId, status) {
    try {
        const payload = await authenticatedRequest(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        })
        const task = payload?.data || payload
        const cached = getCachedTasks()
        setCachedTasks(cached.map((t) => (t.id === taskId || String(t.id) === String(taskId) ? { ...t, status } : t)))
        return task
    } catch (err) {
        console.error('[TaskService] updateTaskStatus error:', err)
        throw err
    }
}

export async function updateTaskDetails(taskId, updates) {
    try {
        const payload = await authenticatedRequest(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        })
        const task = payload?.data || payload
        const cached = getCachedTasks()
        setCachedTasks(cached.map((t) => (t.id === taskId || String(t.id) === String(taskId) ? { ...t, ...updates } : t)))
        return task
    } catch (err) {
        console.error('[TaskService] updateTaskDetails error:', err)
        throw err
    }
}

export async function deleteTask(taskId) {
    try {
        const payload = await authenticatedRequest(`/api/tasks/${taskId}`, {
            method: 'DELETE',
        })
        const cached = getCachedTasks()
        setCachedTasks(cached.filter((t) => t.id !== taskId && String(t.id) !== String(taskId)))
        return payload?.data || payload
    } catch (err) {
        console.error('[TaskService] deleteTask error:', err)
        throw err
    }
}
