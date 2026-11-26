import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { createAccessToken } from '../src/utils/token.js'

process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-only-workflowx-secret'

async function startServer(systemAdminService) {
    const server = createServer(createApp({ systemAdminService }))
    await new Promise((resolve) => server.listen(0, resolve))
    return { server, baseUrl: `http://127.0.0.1:${server.address().port}` }
}

async function closeServer(server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test('global Admin routes authenticate and delegate scoped filters to the system Admin service', async () => {
    const calls = []
    const systemAdminService = {
        async overview(actorId, input) {
            if (actorId !== 'system-admin') {
                const error = new Error('System administrator permission required')
                error.statusCode = 403
                throw error
            }
            calls.push(['overview', actorId, input])
            return { totalUsers: 7 }
        },
        async users(actorId, input) {
            calls.push(['users', actorId, input])
            return { users: [], total: 0 }
        },
    }
    const { server, baseUrl } = await startServer(systemAdminService)
    const adminToken = createAccessToken({ id: 'system-admin', email: 'admin@example.com' })
    const memberToken = createAccessToken({ id: 'member', email: 'member@example.com' })

    try {
        const unauthenticated = await fetch(`${baseUrl}/api/admin/overview`)
        const memberResponse = await fetch(`${baseUrl}/api/admin/overview`, {
            headers: { Authorization: `Bearer ${memberToken}` },
        })
        const overviewResponse = await fetch(`${baseUrl}/api/admin/overview?registeredSince=2026-01-01`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        })
        const usersResponse = await fetch(`${baseUrl}/api/admin/users?role=MANAGER&limit=10`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        })

        assert.equal(unauthenticated.status, 401)
        assert.equal(memberResponse.status, 403)
        assert.equal(overviewResponse.status, 200)
        assert.deepEqual((await overviewResponse.json()).data, { totalUsers: 7 })
        assert.equal(usersResponse.status, 200)
        assert.deepEqual(calls, [
            ['overview', 'system-admin', { registeredSince: '2026-01-01' }],
            ['users', 'system-admin', { search: undefined, role: 'MANAGER', accountStatus: undefined, limit: '10', offset: undefined }],
        ])
    } finally {
        await closeServer(server)
    }
})
