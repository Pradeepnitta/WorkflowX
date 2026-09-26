function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export function createSearchService(searchRepository) {
    return {
        async search(organizationId, query, userId) {
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!query || query.trim().length < 2) throw serviceError('Search query must be at least 2 characters', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            return searchRepository.search({ organizationId, query: query.trim(), userId })
        },
    }
}
