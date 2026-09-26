import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from '../src/utils/password.js'

test('password hashes verify without storing the original password', async () => {
    const password = 'correct horse battery staple'
    const hash = await hashPassword(password)

    assert.notEqual(hash, password)
    assert.match(hash, /^scrypt:[^:]+:[a-f0-9]+$/)
    assert.equal(await verifyPassword(password, hash), true)
    assert.equal(await verifyPassword('wrong password', hash), false)
})

test('malformed password hashes fail verification', async () => {
    assert.equal(await verifyPassword('password', 'not-a-password-hash'), false)
})
