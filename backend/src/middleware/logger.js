export function loggerMiddleware(request, response, next) {
    const start = Date.now()
    const method = request.method
    const url = request.originalUrl || request.url

    // Intercept finish/close to log response status and duration
    request.on('close', () => {
        const duration = Date.now() - start
        if (process.env.NODE_ENV !== 'test') {
            console.log(`[${new Date().toISOString()}] ${method} ${url} - ${duration}ms`)
        }
    })

    if (typeof next === 'function') {
        next()
    }
}
