import { authenticatedRequest } from './authService.js'

export async function getOverview(organizationId) {
    const params = new URLSearchParams({ organizationId })
    return authenticatedRequest(`/api/analytics/overview?${params}`)
}
