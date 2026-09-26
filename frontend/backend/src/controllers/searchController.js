export function createSearchController({ searchService, sendJson }) {
    return {
        async search(request, response, user, organizationId, query) {
            const data = await searchService.search(organizationId, query, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
