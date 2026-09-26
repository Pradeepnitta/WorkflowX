import assert from 'node:assert/strict'
import test from 'node:test'
import { createInvitationAcceptanceService } from '../src/services/invitationAcceptanceService.js'

test('invitation acceptance creates membership through the repository', async () => {
    let input
    const service = createInvitationAcceptanceService({
        async accept(repositoryInput) {
            input = repositoryInput
            return { organizationId: 'organization-1', role: 'MEMBER' }
        },
    })

    const result = await service.accept('opaque-token', 'user-1')
    assert.deepEqual(input, { token: 'opaque-token', userId: 'user-1' })
    assert.deepEqual(result, { organizationId: 'organization-1', role: 'MEMBER', accepted: true })
})

test('invitation acceptance validates token and identity', async () => {
    const service = createInvitationAcceptanceService({})

    await assert.rejects(service.accept('', 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.accept('opaque-token'), (error) => error.statusCode === 401)
})
