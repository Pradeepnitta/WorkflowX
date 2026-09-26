import assert from 'node:assert/strict'
import test from 'node:test'
import jwt from 'jsonwebtoken'
import { createAccessToken, verifyAccessToken } from '../src/utils/token.js'

const secret = 'test-only-workflowx-secret'
process.env.AUTH_ACCESS_TOKEN_SECRET = secret

const user = { id: 'user-123', email: 'admin@example.com' }

test('access tokens round-trip user identity', () => {
    const token = createAccessToken(user)
    const payload = verifyAccessToken(token)

    assert.equal(payload.sub, user.id)
    assert.equal(payload.email, user.email)
})

test('tampered access tokens are rejected', () => {
    const token = createAccessToken(user)
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`

    assert.throws(() => verifyAccessToken(tamperedToken), /invalid signature/i)
})

test('expired access tokens are rejected', () => {
    const token = jwt.sign({ email: user.email }, secret, { subject: user.id, expiresIn: -1 })

    assert.throws(() => verifyAccessToken(token), /jwt expired/i)
})

test('token creation requires a signing secret', () => {
    const previousSecret = process.env.AUTH_ACCESS_TOKEN_SECRET
    delete process.env.AUTH_ACCESS_TOKEN_SECRET

    try {
        assert.throws(() => createAccessToken(user), /AUTH_ACCESS_TOKEN_SECRET is not configured/)
    } finally {
        process.env.AUTH_ACCESS_TOKEN_SECRET = previousSecret
    }
})
