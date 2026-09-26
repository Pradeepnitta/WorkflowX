import assert from 'node:assert/strict'
import test from 'node:test'
import { createRefreshToken, hashRefreshToken, refreshTokenMatches } from '../src/utils/refreshToken.js'

test('refresh tokens are high-entropy opaque values', () => {
    const firstToken = createRefreshToken()
    const secondToken = createRefreshToken()

    assert.notEqual(firstToken, secondToken)
    assert.equal(firstToken.length >= 40, true)
    assert.match(firstToken, /^[A-Za-z0-9_-]+$/)
})

test('refresh token hashes verify without storing the token', () => {
    const token = createRefreshToken()
    const tokenHash = hashRefreshToken(token)

    assert.match(tokenHash, /^[a-f0-9]{64}$/)
    assert.equal(refreshTokenMatches(token, tokenHash), true)
    assert.equal(refreshTokenMatches(`${token}changed`, tokenHash), false)
})
