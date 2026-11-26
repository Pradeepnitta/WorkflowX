import { authenticatedRequest } from './authService.js'

export async function getProjects(organizationId) {
    if (!organizationId) return []
    const params = new URLSearchParams({ organizationId })
    const data = await authenticatedRequest(`/api/projects?${params}`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function createProject(input) {
    const data = await authenticatedRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function updateProject(projectId, input) {
    const data = await authenticatedRequest(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function deleteProject(projectId) {
    const data = await authenticatedRequest(`/api/projects/${projectId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}

export async function getProjectMembers(projectId) {
    if (!projectId) return []
    const data = await authenticatedRequest(`/api/projects/${projectId}/members`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function addProjectMember(projectId, userId) {
    const data = await authenticatedRequest(`/api/projects/${projectId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
    })
    return data?.data || data
}

export async function removeProjectMember(projectId, userId) {
    const data = await authenticatedRequest(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}

export async function getProjectTasks(projectId) {
    if (!projectId || projectId === 'undefined') return []
    const params = new URLSearchParams({ projectId })
    const data = await authenticatedRequest(`/api/projects/tasks?${params}`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function createProjectTask(input) {
    const data = await authenticatedRequest('/api/projects/tasks', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function updateProjectTask(taskId, input) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
    })
    return data?.data || data
}

export async function deleteProjectTask(taskId) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}`, {
        method: 'DELETE',
    })
    return data?.data || data
}

export async function submitProjectTaskForReview(taskId, submissionDetails) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/review`, {
        method: 'POST',
        body: JSON.stringify({ submissionDetails }),
    })
    return data?.data || data
}

export async function reviewProjectTask(taskId, action, feedback) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ action, feedback }),
    })
    return data?.data || data
}

export async function getProjectTaskReviews(taskId) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/reviews`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function getProjectTaskComments(taskId) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/comments`)
    return Array.isArray(data) ? data : data?.data || []
}

export async function createProjectTaskComment(taskId, content, parentId) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content, parentId }),
    })
    return data?.data || data
}

export async function getProjectTaskAttachments(taskId) {
    const data = await authenticatedRequest(`/api/projects/tasks/${taskId}/attachments`)
    return Array.isArray(data) ? data : data?.data || []
}

