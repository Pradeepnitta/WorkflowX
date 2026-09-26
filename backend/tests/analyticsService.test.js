import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnalyticsService } from '../src/services/analyticsService.js'

test('analytics service returns organization overview metrics', async () => {
    let input
    const service = createAnalyticsService({
        async overview(repositoryInput) {
            input = repositoryInput
            return { projects: 3, tasks: 12, completedTasks: 7, overdueTasks: 2, members: 5 }
        },
    })

    const overview = await service.overview('organization-1', 'user-1')
    assert.deepEqual(input, { organizationId: 'organization-1', userId: 'user-1' })
    assert.equal(overview.completedTasks, 7)
})

test('analytics service requires organization and identity', async () => {
    const service = createAnalyticsService({})
    await assert.rejects(service.overview('', 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.overview('organization-1'), (error) => error.statusCode === 401)
})
