export function errorHandlerMiddleware(error, response, sendJson) {
    let statusCode = error.statusCode || 500
    let message = error.message || 'Internal server error'

    // Map PostgreSQL errors to clean client HTTP statuses
    if (error.code === '23503') {
        // foreign_key_violation
        const isUserRef =
            (typeof error.detail === 'string' && /table "User"/i.test(error.detail)) ||
            (typeof error.constraint === 'string' && /(userId|createdById|assigneeId|authorId|uploadedById)/i.test(error.constraint))

        if (isUserRef) {
            statusCode = 401
            message = 'User account not found or session is no longer valid. Please log in again.'
        } else {
            statusCode = 400
            message = error.detail || 'Referenced resource does not exist.'
        }
    } else if (error.code === '23505') {
        // unique_violation
        statusCode = 409
        message = error.detail || 'A record with these details already exists.'
    } else if (error.code === '23502') {
        // not_null_violation
        statusCode = 400
        message = `Missing required field: ${error.column || 'value'}`
    }

    if (statusCode >= 500 && process.env.NODE_ENV !== 'test') {
        console.error('Unhandled Application Error:', error)
    }

    sendJson(response, statusCode, {
        error: message,
        code: error.code || undefined,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
    })
}
