import assert from 'node:assert/strict'
import test from 'node:test'
import { removeMember, updateMemberRole } from '../src/repositories/organizationRepository.js'

test('organization member mutations reject invalid IDs instead of returning success-shaped fallbacks', async () => {
    await assert.rejects(
        updateMemberRole({
            organizationId: 'org-1',
            targetUserId: 'user-2',
            role: 'ADMIN',
            adminUserId: 'user-1',
        }),
        (error) => error.statusCode === 400,
    )
    await assert.rejects(
        removeMember({
            organizationId: 'org-1',
            targetUserId: 'user-2',
            adminUserId: 'user-1',
        }),
        (error) => error.statusCode === 400,
    )
})
