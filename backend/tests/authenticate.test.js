import assert from 'node:assert/strict'
import test from 'node:test'
import { authenticateRequest } from '../src/middleware/authenticate.js'
import { createAccessToken } from '../src/utils/token.js'

process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-only-workflowx-secret'

const user = { id: 'user-123', email: 'admin@example.com' }

function requestWithAuthorization(authorization) {
    return { headers: authorization ? { authorization } : {} }
}

test('authenticateRequest returns the verified token payload', () => {
    const token = createAccessToken(user)
    const payload = authenticateRequest(requestWithAuthorization(`Bearer ${token}`))

    assert.equal(payload.sub, user.id)
    assert.equal(payload.email, user.email)
})

test('authenticateRequest rejects missing and malformed authorization', () => {
    assert.throws(() => authenticateRequest(requestWithAuthorization()), (error) => (
        error.statusCode === 401 && error.message === 'Authentication required'
    ))
    assert.throws(() => authenticateRequest(requestWithAuthorization('Basic credentials')), (error) => (
        error.statusCode === 401 && error.message === 'Authentication required'
    ))
})

test('authenticateRequest rejects invalid bearer tokens', () => {
    assert.throws(() => authenticateRequest(requestWithAuthorization('Bearer invalid-token')), (error) => (
        error.statusCode === 401 && error.message === 'Invalid or expired access token'
    ))
})
