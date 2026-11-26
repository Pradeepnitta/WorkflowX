import assert from 'node:assert/strict'
import test from 'node:test'
import { createSystemAdminService } from '../src/services/systemAdminService.js'

test('system admin service authorizes global overview and applies a registration window', async () => {
    let overviewInput
    const service = createSystemAdminService({
        async assertSystemAdmin(userId) {
            assert.equal(userId, 'admin-1')
        },
        async getGlobalOverview(input) {
            overviewInput = input
            return { totalUsers: 4 }
        },
    })

    const overview = await service.overview('admin-1')

    assert.equal(overview.totalUsers, 4)
    assert.ok(overviewInput.registeredSince instanceof Date)
})

test('system admin user filters validate roles and account states before repository access', async () => {
    let listCalled = false
    const service = createSystemAdminService({
        async assertSystemAdmin() {},
        async listUsers() {
            listCalled = true
            return { users: [], total: 0 }
        },
    })

    await assert.rejects(
        service.users('admin-1', { role: 'ROOT' }),
        (error) => error.statusCode === 400,
    )
    await assert.rejects(
        service.users('admin-1', { accountStatus: 'DELETED' }),
        (error) => error.statusCode === 400,
    )
    assert.equal(listCalled, false)
})

test('system admin service validates account changes and delegates safe fields', async () => {
    let updateInput
    const service = createSystemAdminService({
        async assertSystemAdmin() {},
        async updateUser(input) {
            updateInput = input
            return { id: input.targetUserId, email: input.changes.email, accountStatus: input.changes.accountStatus }
        },
    })

    await assert.rejects(
        service.updateUser('admin-1', 'user-1', { systemRole: 'MANAGER' }),
        (error) => error.statusCode === 400,
    )
    const updated = await service.updateUser('admin-1', '00000000-0000-0000-0000-000000000001', {
        email: '  USER@example.com ',
        accountStatus: 'SUSPENDED',
        passwordHash: 'must-not-be-passed',
    })

    assert.deepEqual(updateInput.changes, {
        email: 'user@example.com',
        accountStatus: 'SUSPENDED',
    })
    assert.equal(updated.accountStatus, 'SUSPENDED')
})
