import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthService } from '../src/services/authService.js'
import { createOrganizationService } from '../src/services/organizationService.js'
import { createSystemAdminService } from '../src/services/systemAdminService.js'
import { hashPassword } from '../src/utils/password.js'

process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-only-workflowx-secret'

test('authService.updateProfile requires currentPassword when changing password', async () => {
    const existingHash = await hashPassword('old-password-123')
    const auth = createAuthService({
        async findById(id) {
            return { id, email: 'admin@example.com', passwordHash: existingHash }
        },
        async updateProfile({ userId, passwordHash }) {
            return { id: userId, email: 'admin@example.com', passwordHash }
        },
    })

    await assert.rejects(
        auth.updateProfile({ newPassword: 'new-password-456' }, 'user-1'),
        (err) => err.statusCode === 400 && err.message === 'Current password is required',
    )

    await assert.rejects(
        auth.updateProfile({ currentPassword: 'wrong-password', newPassword: 'new-password-456' }, 'user-1'),
        (err) => err.statusCode === 400 && err.message === 'Current password is incorrect',
    )

    const updated = await auth.updateProfile(
        { currentPassword: 'old-password-123', newPassword: 'new-password-456' },
        'user-1',
    )
    assert.equal(updated.email, 'admin@example.com')
    assert.equal('passwordHash' in updated, false)
})

test('organizationService validates createUser, updateOrganization, and listAuditLogs', async () => {
    let createdPayload = null
    let updatedOrg = null
    const service = createOrganizationService({
        async createOrgUser(payload) {
            createdPayload = payload
            return { id: 'user-2', email: payload.email, role: payload.role }
        },
        async updateOrganization(payload) {
            updatedOrg = payload
            return { id: payload.organizationId, ...payload.changes }
        },
        async listOrgAuditLogs(payload) {
            return { logs: [{ id: 'log-1', action: payload.action || 'USER_CREATED' }], total: 1 }
        },
    })

    await assert.rejects(
        service.createUser('org-1', { name: 'A', email: 'bad', password: '123' }, 'admin-1'),
        (err) => err.statusCode === 400,
    )

    const created = await service.createUser(
        'org-1',
        { name: 'Jane Dev', email: 'Jane@Example.com', password: 'password123', role: 'MEMBER', accountStatus: 'ACTIVE' },
        'admin-1',
    )
    assert.equal(created.email, 'jane@example.com')
    assert.ok(createdPayload.passwordHash && createdPayload.passwordHash !== 'password123')

    const org = await service.updateOrganization('org-1', { name: '  Acme Corp  ', description: 'Updated' }, 'admin-1')
    assert.equal(org.name, 'Acme Corp')
    assert.equal(updatedOrg.changes.description, 'Updated')

    const logs = await service.listAuditLogs('org-1', 'admin-1', { action: 'user_created', limit: 10, offset: 0 })
    assert.equal(logs.total, 1)
    assert.equal(logs.logs[0].action, 'USER_CREATED')
})

test('systemAdminService.createUser validates fields and hashes password', async () => {
    let repoInput = null
    const service = createSystemAdminService({
        async assertSystemAdmin() {},
        async createUser(input) {
            repoInput = input
            return { id: 'u-new', name: input.name, email: input.email, systemRole: input.systemRole }
        },
    })

    await assert.rejects(
        service.createUser('admin-1', { name: 'Jo', email: 'invalid', password: 'short' }),
        (err) => err.statusCode === 400,
    )

    const user = await service.createUser('admin-1', {
        name: 'New Manager',
        email: 'Manager@Example.com',
        password: 'password123',
        systemRole: 'USER',
        accountStatus: 'ACTIVE',
    })
    assert.equal(user.email, 'manager@example.com')
    assert.ok(repoInput.passwordHash && repoInput.passwordHash !== 'password123')
})
