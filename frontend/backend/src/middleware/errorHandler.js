export function errorHandlerMiddleware(error, response, sendJson) {
    const statusCode = error.statusCode || 500
    const message = error.message || 'Internal server error'

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
