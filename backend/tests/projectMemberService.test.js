import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectMemberService } from '../src/services/projectMemberService.js'

test('project member service manages and lists members', async () => {
    const calls = []
    const repository = {
        async addMember(input) { calls.push({ method: 'add', input }) },
        async removeMember(input) { calls.push({ method: 'remove', input }) },
        async findForMember(input) {
            calls.push({ method: 'list', input })
            return [{ user: { id: 'user-2', name: 'Alex Kim', email: 'alex@example.com' }, joinedAt: '2026-09-19T00:00:00.000Z' }]
        },
    }
    const service = createProjectMemberService(repository)

    assert.deepEqual(await service.add('project-1', 'user-2', 'user-1'), { projectId: 'project-1', userId: 'user-2' })
    assert.deepEqual(await service.remove('project-1', 'user-2', 'user-1'), { projectId: 'project-1', userId: 'user-2' })
    assert.equal((await service.list('project-1', 'user-1'))[0].email, 'alex@example.com')
    assert.deepEqual(calls.map(({ method }) => method), ['add', 'remove', 'list'])
})
