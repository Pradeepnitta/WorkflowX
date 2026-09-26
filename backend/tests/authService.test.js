import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthService } from '../src/services/authService.js'
import { verifyAccessToken } from '../src/utils/token.js'
import { verifyPassword } from '../src/utils/password.js'
import { hashRefreshToken } from '../src/utils/refreshToken.js'

process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-only-workflowx-secret'

function createRepository() {
    const users = []
    return {
        users,
        async findByEmail(email) {
            return users.find((user) => user.email === email) || null
        },
        async create(user) {
            const createdUser = { id: `user-${users.length + 1}`, ...user }
            users.push(createdUser)
            return createdUser
        },
    }
}

test('auth service registers and logs in a user', async () => {
    const repository = createRepository()
    const auth = createAuthService(repository)
    const registration = await auth.register({ name: 'Jordan Davis', email: ' Jordan@Example.com ', password: 'correct horse' })

    assert.equal(registration.user.email, 'jordan@example.com')
    assert.equal(registration.user.name, 'Jordan Davis')
    assert.equal('passwordHash' in registration.user, false)
    assert.equal(await verifyPassword('correct horse', repository.users[0].passwordHash), true)
    assert.equal(verifyAccessToken(registration.accessToken).sub, 'user-1')

    const login = await auth.login({ email: 'JORDAN@example.com', password: 'correct horse' })
    assert.equal(login.user.id, 'user-1')
})

test('auth service rejects duplicates and invalid login credentials', async () => {
    const repository = createRepository()
    const auth = createAuthService(repository)
    await auth.register({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse' })

    await assert.rejects(
        auth.register({ name: 'Another User', email: 'JORDAN@example.com', password: 'another password' }),
        (error) => error.statusCode === 409,
    )
    await assert.rejects(
        auth.login({ email: 'jordan@example.com', password: 'wrong password' }),
        (error) => error.statusCode === 401,
    )
})

test('auth service validates registration input', async () => {
    const auth = createAuthService(createRepository())

    await assert.rejects(
        auth.register({ name: 'J', email: 'bad-email', password: 'short' }),
        (error) => error.statusCode === 400 && error.message === 'Name must be at least 2 characters',
    )
})

test('auth service updates profile fields without exposing credentials', async () => {
    const auth = createAuthService({
        async updateProfile(input) {
            return { id: input.userId, name: input.name || 'Jordan Davis', email: 'jordan@example.com', avatarUrl: input.avatarUrl || null, passwordHash: 'hidden' }
        },
    })

    assert.deepEqual(await auth.updateProfile({ name: ' Jordan Updated ' }, 'user-1'), {
        id: 'user-1',
        name: 'Jordan Updated',
        email: 'jordan@example.com',
        avatarUrl: null,
    })
    await assert.rejects(auth.updateProfile({}, 'user-1'), (error) => error.statusCode === 400)
})

test('auth service rotates refresh tokens and revokes the previous token', async () => {
    const userRepository = createRepository()
    const refreshTokens = []
    const refreshTokenRepository = {
        async create(token) {
            refreshTokens.push({ id: `refresh-${refreshTokens.length + 1}`, ...token })
        },
        async findActiveByHash(tokenHash) {
            const token = refreshTokens.find((item) => item.tokenHash === tokenHash && !item.revokedAt)
            return token ? { ...token, user: userRepository.users.find((user) => user.id === token.userId) } : null
        },
        async revoke(id) {
            const token = refreshTokens.find((item) => item.id === id)
            token.revokedAt = new Date()
        },
    }
    const auth = createAuthService(userRepository, refreshTokenRepository)
    const registration = await auth.register({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse' })
    const rotated = await auth.refresh({ refreshToken: registration.refreshToken })

    assert.notEqual(rotated.refreshToken, registration.refreshToken)
    assert.equal(refreshTokens.length, 2)
    assert.equal(refreshTokens[0].tokenHash, hashRefreshToken(registration.refreshToken))
    assert.ok(refreshTokens[0].revokedAt)
    await assert.rejects(auth.refresh({ refreshToken: registration.refreshToken }), (error) => error.statusCode === 401)
})

test('auth service makes logout idempotent and revokes active sessions', async () => {
    const userRepository = createRepository()
    const refreshTokens = []
    const refreshTokenRepository = {
        async create(token) {
            refreshTokens.push({ id: `refresh-${refreshTokens.length + 1}`, ...token })
        },
        async findActiveByHash(tokenHash) {
            const token = refreshTokens.find((item) => item.tokenHash === tokenHash && !item.revokedAt)
            return token ? { ...token, user: userRepository.users.find((user) => user.id === token.userId) } : null
        },
        async revoke(id) {
            refreshTokens.find((item) => item.id === id).revokedAt = new Date()
        },
    }
    const auth = createAuthService(userRepository, refreshTokenRepository)
    const registration = await auth.register({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse' })

    assert.deepEqual(await auth.logout({ refreshToken: registration.refreshToken }), { loggedOut: true })
    assert.deepEqual(await auth.logout({ refreshToken: 'unknown-token' }), { loggedOut: true })
    assert.ok(refreshTokens[0].revokedAt)
})

test('auth service requires and validates adminKey for admin signup and signin', async () => {
    process.env.ADMIN_SECRET_KEY = 'test-master-admin-key'
    const repository = createRepository()
    const auth = createAuthService(repository)

    // Admin signup without key -> fails 403
    await assert.rejects(
        auth.register({ name: 'Admin User', email: 'admin@workflowx.com', password: 'password123', role: 'ADMIN' }),
        (error) => error.statusCode === 403 && error.message.includes('Admin Secret Key is required'),
    )

    // Admin signup with invalid key -> fails 403
    await assert.rejects(
        auth.register({ name: 'Admin User', email: 'admin@workflowx.com', password: 'password123', role: 'ADMIN', adminKey: 'wrong-key' }),
        (error) => error.statusCode === 403 && error.message.includes('Invalid Admin Secret Key'),
    )

    // Admin signup with valid key -> succeeds
    const adminReg = await auth.register({
        name: 'Admin User',
        email: 'admin@workflowx.com',
        password: 'password123',
        role: 'ADMIN',
        adminKey: 'test-master-admin-key',
    })
    assert.equal(adminReg.user.email, 'admin@workflowx.com')

    // Mark user with admin membership in repository
    const userInDb = repository.users.find((u) => u.email === 'admin@workflowx.com')
    userInDb.memberships = [{ role: 'ADMIN' }]

    // Admin login without admin key -> fails 403
    await assert.rejects(
        auth.login({ email: 'admin@workflowx.com', password: 'password123' }),
        (error) => error.statusCode === 403 && error.message.includes('Admin Secret Key is required'),
    )

    // Admin login with wrong admin key -> fails 403
    await assert.rejects(
        auth.login({ email: 'admin@workflowx.com', password: 'password123', adminKey: 'bad-key' }),
        (error) => error.statusCode === 403 && error.message.includes('Invalid Admin Secret Key'),
    )

    // Admin login with valid admin key -> succeeds
    const adminLogin = await auth.login({
        email: 'admin@workflowx.com',
        password: 'password123',
        adminKey: 'test-master-admin-key',
    })
    assert.equal(adminLogin.user.email, 'admin@workflowx.com')
})
