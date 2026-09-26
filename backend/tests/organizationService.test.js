import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrganizationService } from '../src/services/organizationService.js'

test('organization service creates an organization with the authenticated owner', async () => {
    const calls = []
    const service = createOrganizationService({
        async createWithAdmin(input) {
            calls.push(input)
            return { id: 'organization-1', name: input.name, description: input.description }
        },
    })

    const organization = await service.create({ name: ' Acme Inc. ', description: ' Team workspace ' }, 'user-1')

    assert.deepEqual(organization, { id: 'organization-1', name: 'Acme Inc.', description: 'Team workspace' })
    assert.deepEqual(calls, [{ name: 'Acme Inc.', description: 'Team workspace', userId: 'user-1' }])
})

test('organization service rejects missing owner or short names', async () => {
    const service = createOrganizationService({ createWithAdmin: async () => ({}) })

    await assert.rejects(service.create({ name: 'A' }, 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.create({ name: 'Acme' }), (error) => error.statusCode === 401)
})

test('organization service lists only the user memberships', async () => {
    const service = createOrganizationService({
        async findForUser(userId) {
            assert.equal(userId, 'user-1')
            return [{ id: 'organization-1', name: 'Acme Inc.', description: '', role: 'ADMIN' }]
        },
    })

    assert.deepEqual(await service.list('user-1'), [{
        id: 'organization-1',
        name: 'Acme Inc.',
        description: null,
        role: 'ADMIN',
    }])
})

test('organization service lists members, updates roles, and removes members', async () => {
    let roleUpdated = null
    let memberRemoved = null

    const mockRepo = {
        async findMembers(orgId) {
            return [{ user: { id: 'u2', name: 'Alex', email: 'alex@example.com', avatarUrl: null }, role: 'MEMBER', joinedAt: '2026-01-01' }]
        },
        async updateMemberRole(params) {
            roleUpdated = params
            return { userId: params.targetUserId, role: params.role, user: { id: params.targetUserId, name: 'Alex', email: 'alex@example.com' } }
        },
        async removeMember(params) {
            memberRemoved = params
            return { count: 1 }
        },
    }

    const service = createOrganizationService(mockRepo)

    const members = await service.listMembers('org-1', 'user-1')
    assert.equal(members.length, 1)
    assert.equal(members[0].role, 'MEMBER')

    const updated = await service.updateMemberRole('org-1', 'u2', 'MANAGER', 'user-1')
    assert.equal(updated.role, 'MANAGER')
    assert.equal(roleUpdated.role, 'MANAGER')

    await service.removeMember('org-1', 'u2', 'user-1')
    assert.equal(memberRemoved.targetUserId, 'u2')
})

