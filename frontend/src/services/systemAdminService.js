import { authenticatedRequest } from './authService.js'

function queryString(filters) {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value))
        }
    }
    const encoded = params.toString()
    return encoded ? `?${encoded}` : ''
}

export async function getSystemAdminOverview(filters = {}) {
    return authenticatedRequest(`/api/admin/overview${queryString(filters)}`)
}

export async function getSystemAdminUsers(filters = {}) {
    return authenticatedRequest(`/api/admin/users${queryString(filters)}`)
}

export async function updateSystemAdminUser(userId, changes) {
    return authenticatedRequest(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
    })
}

export async function getSystemAdminAuditLogs(filters = {}) {
    return authenticatedRequest(`/api/admin/audit-logs${queryString(filters)}`)
}
