const defaultWindowMs = 60 * 1000 // 1 minute
const defaultMax = 120 // requests per window

const requestCounts = new Map()

export function rateLimiterMiddleware(request, responseOrOptions, maybeNext) {
    const next = typeof maybeNext === 'function' ? maybeNext : typeof responseOrOptions === 'function' ? responseOrOptions : null

    if (process.env.NODE_ENV === 'test') {
        if (next) return next()
        return // Bypass during testing
    }

    const forwarded = typeof request.headers?.['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0].trim()
        : null
    const ip = forwarded || request.headers?.['x-real-ip'] || request.socket?.remoteAddress || 'unknown'
    const now = Date.now()

    let record = requestCounts.get(ip)
    if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + defaultWindowMs }
        requestCounts.set(ip, record)
    }

    record.count += 1

    if (record.count > defaultMax) {
        const error = new Error('Too many requests, please try again later.')
        error.statusCode = 429
        if (next) return next(error)
        throw error
    }

    if (next) {
        next()
    }
}
