import { createHash, randomBytes } from 'node:crypto'

const tokenBytes = 32

export function createRefreshToken() {
    return randomBytes(tokenBytes).toString('base64url')
}

export function hashRefreshToken(token) {
    return createHash('sha256').update(token).digest('hex')
}

export function refreshTokenMatches(token, tokenHash) {
    return hashRefreshToken(token) === tokenHash
}
