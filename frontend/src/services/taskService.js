async function request(url, options) {
    try {
        const response = await fetch(url, options)
        const payload = await response.json()

        if (!response.ok) {
            console.warn(`[TaskService] Request to ${url} failed with status ${response.status}`)
            return { data: [] }
        }

        return payload
    } catch (err) {
        console.warn(`[TaskService] Request to ${url} error:`, err.message)
        return { data: [] }
    }
}

export async function getTasks() {
    const payload = await request('/api/tasks')
    return payload.data
}

export async function createTask(input) {
    const payload = await request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })
    return payload.data
}

export async function updateTaskStatus(taskId, status) {
    const payload = await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    })
    return payload.data
}

export async function updateTaskDetails(taskId, updates) {
    const payload = await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
    })
    return payload.data
}

export async function deleteTask(taskId) {
    const payload = await request(`/api/tasks/${taskId}`, {
        method: 'DELETE',
    })
    return payload.data
}

