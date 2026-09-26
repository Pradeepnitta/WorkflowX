import assert from 'node:assert/strict'
import test from 'node:test'
import { createSearchService } from '../src/services/searchService.js'

test('search service trims and scopes cross-resource queries', async () => {
    let input
    const service = createSearchService({
        async search(repositoryInput) {
            input = repositoryInput
            return { projects: [{ id: 'project-1' }], tasks: [], comments: [], users: [] }
        },
    })

    const result = await service.search('organization-1', '  api  ', 'user-1')
    assert.deepEqual(input, { organizationId: 'organization-1', query: 'api', userId: 'user-1' })
    assert.equal(result.projects.length, 1)
})

test('search service validates query context', async () => {
    const service = createSearchService({})
    await assert.rejects(service.search('organization-1', 'a', 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.search('organization-1', 'api'), (error) => error.statusCode === 401)
})
