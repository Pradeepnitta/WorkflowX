const defaultWindowMs = 60 * 1000 // 1 minute
const defaultMax = 120 // requests per window

const requestCounts = new Map()

export function rateLimiterMiddleware(request, { windowMs = defaultWindowMs, max = defaultMax } = {}) {
    if (process.env.NODE_ENV === 'test') {
        return // Bypass during testing
    }

    const forwarded = typeof request.headers?.['x-forwarded-for'] === 'string'
        ? request.headers['x-forwarded-for'].split(',')[0].trim()
        : null
    const ip = forwarded || request.headers?.['x-real-ip'] || request.socket?.remoteAddress || 'unknown'
    const now = Date.now()

    let record = requestCounts.get(ip)
    if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + windowMs }
        requestCounts.set(ip, record)
    }

    record.count += 1

    if (record.count > max) {
        const error = new Error('Too many requests, please try again later.')
        error.statusCode = 429
        throw error
    }
}
