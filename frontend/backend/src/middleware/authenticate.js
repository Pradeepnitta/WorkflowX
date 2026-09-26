import { verifyAccessToken } from '../utils/token.js'

function authenticationError(message) {
    const error = new Error(message)
    error.statusCode = 401
    return error
}

export function authenticateRequest(request) {
    const authorization = request.headers.authorization || ''
    const [scheme, token] = authorization.split(' ')

    if (scheme !== 'Bearer' || !token) {
        throw authenticationError('Authentication required')
    }

    try {
        return verifyAccessToken(token)
    } catch {
        throw authenticationError('Invalid or expired access token')
    }
}
