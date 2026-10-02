export function createSearchController({ searchService, sendJson }) {
    return {
        async search(request, response, user, organizationId, query) {
            if (!organizationId || organizationId === 'undefined' || !query || query.trim().length < 2) {
                return sendJson(response, 200, {
                    data: {
                        projects: [],
                        tasks: [],
                        comments: [],
                        users: [],
                    },
                })
            }
            const data = await searchService.search(organizationId, query, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
