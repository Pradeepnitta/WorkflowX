import { authenticatedRequest } from './authService.js'

export async function searchWorkspace(query, organizationId) {
    if (!query || query.trim().length < 2 || !organizationId || organizationId === 'undefined') {
        return { projects: [], tasks: [], comments: [], users: [] }
    }
    const params = new URLSearchParams({ q: query.trim(), organizationId })
    return authenticatedRequest(`/api/search?${params}`)
}
