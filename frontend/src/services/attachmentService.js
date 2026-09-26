import { getAccessToken } from './authService.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

export async function uploadAttachment(taskId, fileData) {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE}/api/projects/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(fileData),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Failed to upload attachment')
    return body.data
}

export async function getTaskAttachments(taskId) {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE}/api/projects/tasks/${taskId}/attachments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Failed to fetch attachments')
    return body.data
}

export async function deleteAttachment(attachmentId) {
    const token = getAccessToken()
    const response = await fetch(`${API_BASE}/api/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || 'Failed to delete attachment')
    return body.data
}
