export function corsMiddleware(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')

    if (request.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return true // Handled
    }
    return false // Continue to next handler
}
