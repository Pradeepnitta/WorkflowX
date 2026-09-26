import jwt from 'jsonwebtoken'

const accessTokenLifetime = '15m'

function tokenSecret() {
    return process.env.AUTH_ACCESS_TOKEN_SECRET || 'workflowx-development-access-token-secret-key-2026'
}

export function createAccessToken(user) {
    return jwt.sign(
        { email: user.email },
        tokenSecret(),
        { subject: user.id, expiresIn: accessTokenLifetime },
    )
}

export function verifyAccessToken(token) {
    return jwt.verify(token, tokenSecret())
}

export const verifyToken = verifyAccessToken

