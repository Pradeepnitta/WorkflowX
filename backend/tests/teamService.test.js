import assert from 'node:assert/strict'
import test from 'node:test'
import { createTeamService } from '../src/services/teamService.js'

test('team service creates and lists organization teams', async () => {
    const teams = []
    const service = createTeamService({
        async createForMember(input) {
            const team = { id: `team-${teams.length + 1}`, ...input }
            teams.push(team)
            return team
        },
        async findForMember({ organizationId, userId }) {
            assert.equal(organizationId, 'organization-1')
            assert.equal(userId, 'user-1')
            return teams
        },
    })

    const created = await service.create({ name: ' Product ', description: ' Core team ', organizationId: 'organization-1', memberUserIds: ['user-2', 'user-3'] }, 'user-1')
    const listed = await service.list('organization-1', 'user-1')

    assert.deepEqual(created, { id: 'team-1', name: 'Product', description: 'Core team', organizationId: 'organization-1', members: [] })
    assert.deepEqual(listed, [created])
    assert.deepEqual(teams[0].memberUserIds, ['user-2', 'user-3'])
})

test('team service validates organization and team names', async () => {
    const service = createTeamService({})

    await assert.rejects(service.create({ name: 'P', organizationId: 'organization-1' }, 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.list('', 'user-1'), (error) => error.statusCode === 400)
})

test('team service adds and removes members', async () => {
    const calls = []
    const service = createTeamService({
        async addMember(input) {
            calls.push({ method: 'add', input })
        },
        async removeMember(input) {
            calls.push({ method: 'remove', input })
        },
    })

    assert.deepEqual(await service.addMember('team-1', 'user-2', 'user-1'), { teamId: 'team-1', userId: 'user-2' })
    assert.deepEqual(await service.removeMember('team-1', 'user-2', 'user-1'), { teamId: 'team-1', userId: 'user-2' })
    assert.deepEqual(calls.map(({ method }) => method), ['add', 'remove'])
})
