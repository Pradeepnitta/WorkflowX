function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

export function createAnalyticsService(analyticsRepository) {
    return {
        async overview(organizationId, userId) {
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            return analyticsRepository.overview({ organizationId, userId })
        },
    }
}
