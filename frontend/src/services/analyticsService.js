import { authenticatedRequest } from './authService.js'

export async function getOverview(organizationId) {
    if (!organizationId || organizationId === 'undefined') return null
    const params = new URLSearchParams({ organizationId })
    return authenticatedRequest(`/api/analytics/overview?${params}`)
}
