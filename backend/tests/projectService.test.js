import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectService } from '../src/services/projectService.js'

test('project service creates and lists organization projects', async () => {
    const projects = []
    const service = createProjectService({
        async createForMember(input) {
            const project = { id: `project-${projects.length + 1}`, ...input, createdById: input.userId, startDate: null }
            projects.push(project)
            return project
        },
        async findForMember({ organizationId, userId }) {
            assert.equal(organizationId, 'organization-1')
            assert.equal(userId, 'user-1')
            return projects
        },
    })

    const created = await service.create({ name: ' Website refresh ', organizationId: 'organization-1', dueDate: '2026-10-01' }, 'user-1')
    const listed = await service.list('organization-1', 'user-1')

    assert.equal(created.name, 'Website refresh')
    assert.equal(created.status, 'PLANNING')
    assert.equal(created.visibility, 'ORGANIZATION')
    assert.equal(created.priority, 'MEDIUM')
    assert.equal(created.dueDate.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.deepEqual(listed, [created])
})

test('project service rejects invalid project options', async () => {
    const service = createProjectService({})

    await assert.rejects(
        service.create({ name: 'Project', organizationId: 'organization-1', status: 'UNKNOWN' }, 'user-1'),
        (error) => error.statusCode === 400,
    )
    await assert.rejects(
        service.create({ name: 'Project', organizationId: 'organization-1', dueDate: 'not-a-date' }, 'user-1'),
        (error) => error.statusCode === 400,
    )
})

test('project service updates project lifecycle fields', async () => {
    let updateInput
    const service = createProjectService({
        async updateForManager(input) {
            updateInput = input
            return { id: 'project-1', name: 'Website refresh', description: null, status: 'ARCHIVED', visibility: 'ORGANIZATION', priority: 'MEDIUM', organizationId: 'organization-1', createdById: 'user-1', startDate: null, dueDate: null }
        },
    })

    const project = await service.update('project-1', { status: 'ARCHIVED' }, 'user-1')
    assert.equal(project.status, 'ARCHIVED')
    assert.deepEqual(updateInput.changes, { status: 'ARCHIVED' })
})
