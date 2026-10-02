export function createAnalyticsController({ analyticsService, sendJson }) {
    return {
        async overview(request, response, user, organizationId) {
            if (!organizationId || organizationId === 'undefined') {
                return sendJson(response, 200, {
                    data: {
                        projects: 0,
                        members: 0,
                        tasks: 0,
                        completedTasks: 0,
                        overdueTasks: 0,
                    },
                })
            }
            const data = await analyticsService.overview(organizationId, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
