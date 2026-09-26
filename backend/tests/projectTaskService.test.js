import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectTaskService } from '../src/services/projectTaskService.js'

test('project task service creates and lists project tasks', async () => {
    const tasks = []
    const service = createProjectTaskService({
        async createForProject(input) {
            const task = { id: `task-${tasks.length + 1}`, ...input, createdById: input.userId }
            tasks.push(task)
            return task
        },
        async findForProject({ projectId, userId }) {
            assert.equal(projectId, 'project-1')
            assert.equal(userId, 'user-1')
            return tasks
        },
    })

    const created = await service.create({ title: ' Ship API ', projectId: 'project-1', dueDate: '2026-10-01' }, 'user-1')
    const listed = await service.list('project-1', 'user-1')

    assert.equal(created.title, 'Ship API')
    assert.equal(created.status, 'TODO')
    assert.equal(created.priority, 'MEDIUM')
    assert.equal(created.dueDate.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.deepEqual(listed, [created])
})

test('project task service rejects invalid task options', async () => {
    const service = createProjectTaskService({})

    await assert.rejects(
        service.create({ title: 'Task', projectId: 'project-1', priority: 'INVALID' }, 'user-1'),
        (error) => error.statusCode === 400,
    )
})

test('project task service updates task fields', async () => {
    let updateInput
    const service = createProjectTaskService({
        async updateForMember(input) {
            updateInput = input
            return { id: 'task-1', projectId: 'project-1', title: 'Ship API', status: 'COMPLETED', priority: 'HIGH', createdById: 'user-1', assigneeId: null, description: null, dueDate: null }
        },
    })

    const task = await service.update('task-1', { status: 'COMPLETED', priority: 'HIGH' }, 'user-1')
    assert.equal(task.status, 'COMPLETED')
    assert.deepEqual(updateInput.changes, { status: 'COMPLETED', priority: 'HIGH' })
})
