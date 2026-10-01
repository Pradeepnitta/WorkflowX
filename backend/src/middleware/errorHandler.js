export function errorHandlerMiddleware(error, arg2, arg3, arg4) {
    let req, res, next, sender = null

    if (arg4 !== undefined) {
        // Express error middleware: (err, req, res, next)
        req = arg2
        res = arg3
        next = arg4
    } else if (arg2 && (typeof arg2.status === 'function' || typeof arg2.writeHead === 'function')) {
        // Legacy direct call: (error, response, sendJson)
        res = arg2
        if (typeof arg3 === 'function') sender = arg3
    } else {
        res = arg3
    }

    if (res && res.headersSent) {
        if (typeof next === 'function') return next(error)
        return
    }

    let statusCode = error.statusCode || error.status || 500
    let message = error.message || 'Internal server error'

    // Handle Express body-parser errors
    if (error.type === 'entity.parse.failed' || (error instanceof SyntaxError && (error.status === 400 || error.statusCode === 400))) {
        statusCode = 400
        message = 'Request body must be valid JSON'
    } else if (error.type === 'entity.too.large' || error.status === 413 || error.statusCode === 413) {
        statusCode = 413
        message = 'Request body is too large'
    } else if (error.code === '23503') {
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

    const payload = {
        error: message,
        code: error.code || undefined,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
    }

    if (res) {
        if (typeof sender === 'function') {
            sender(res, statusCode, payload)
        } else if (typeof res.status === 'function' && typeof res.json === 'function') {
            res.setHeader('Cache-Control', 'no-store')
            res.status(statusCode).json(payload)
        } else if (typeof res.writeHead === 'function') {
            res.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-store',
            })
            res.end(JSON.stringify(payload))
        }
    }
}

