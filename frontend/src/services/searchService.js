import { authenticatedRequest } from './authService.js'

export async function searchWorkspace(query, organizationId) {
    const params = new URLSearchParams({ q: query, organizationId })
    return authenticatedRequest(`/api/search?${params}`)
}
