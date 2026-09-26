import jwt from 'jsonwebtoken'

const accessTokenLifetime = '15m'

function tokenSecret() {
    const secret = process.env.AUTH_ACCESS_TOKEN_SECRET
    if (!secret) throw new Error('AUTH_ACCESS_TOKEN_SECRET is not configured')
    return secret
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

