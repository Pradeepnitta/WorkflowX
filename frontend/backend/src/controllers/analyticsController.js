export function createAnalyticsController({ analyticsService, sendJson }) {
    return {
        async overview(request, response, user, organizationId) {
            const data = await analyticsService.overview(organizationId, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
