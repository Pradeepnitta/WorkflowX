import assert from 'node:assert/strict'
import test from 'node:test'
import { createInvitationService } from '../src/services/invitationService.js'
import { hashRefreshToken } from '../src/utils/refreshToken.js'

test('invitation service creates a normalized expiring invitation', async () => {
    let input
    const service = createInvitationService({
        async createForAdmin(repositoryInput) {
            input = repositoryInput
            return { id: 'invitation-1', email: repositoryInput.email, expiresAt: repositoryInput.expiresAt }
        },
    })

    const invitation = await service.create('organization-1', { email: ' Member@Example.com ', role: 'MEMBER' }, 'user-1')

    assert.equal(invitation.email, 'member@example.com')
    assert.equal(invitation.role, 'MEMBER')
    assert.equal(typeof invitation.token, 'string')
    assert.equal(input.tokenHash, hashRefreshToken(invitation.token))
    assert.ok(input.expiresAt > new Date())
})

test('invitation service validates roles and identity', async () => {
    const service = createInvitationService({})

    await assert.rejects(service.create('organization-1', { email: 'member@example.com', role: 'NOPE' }, 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.create('organization-1', { email: 'member@example.com' }), (error) => error.statusCode === 401)
})
