import assert from 'node:assert/strict'
import test from 'node:test'
import { createProjectTaskService } from '../src/services/projectTaskService.js'

test('project task service creates and lists project tasks', async () => {
    const tasks = []
    const scheduledTasks = []
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
    }, {
        async schedule(task) {
            scheduledTasks.push(task)
        },
        async cancel() {},
    })

    const created = await service.create({ title: ' Ship API ', projectId: 'project-1', dueDate: '2026-10-01' }, 'user-1')
    const listed = await service.list('project-1', 'user-1')

    assert.equal(created.title, 'Ship API')
    assert.equal(created.status, 'TODO')
    assert.equal(created.priority, 'MEDIUM')
    assert.equal(created.dueDate.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.deepEqual(listed, [created])
    assert.deepEqual(scheduledTasks, [created])
})

test('project task service rejects invalid task options', async () => {
    const service = createProjectTaskService({})

    await assert.rejects(
        service.create({ title: 'Task', projectId: 'project-1', priority: 'INVALID' }, 'user-1'),
        (error) => error.statusCode === 400,
    )
})

test('project task service rejects statuses reserved for review and completion', async () => {
    const service = createProjectTaskService({})

    for (const status of ['IN_REVIEW', 'COMPLETED']) {
        await assert.rejects(
            service.create({ title: 'Task', projectId: 'project-1', status }, 'user-1'),
            (error) => error.statusCode === 400 && /TODO or IN_PROGRESS/.test(error.message),
        )
    }
})

test('project task service updates task fields', async () => {
    let updateInput
    let scheduledTask
    const service = createProjectTaskService({
        async updateForMember(input) {
            updateInput = input
            return { id: 'task-1', projectId: 'project-1', title: 'Ship API', status: 'COMPLETED', priority: 'HIGH', createdById: 'user-1', assigneeId: null, description: null, dueDate: null }
        },
    }, {
        async schedule(task) {
            scheduledTask = task
        },
        async cancel() {},
    })

    const task = await service.update('task-1', { status: 'COMPLETED', priority: 'HIGH' }, 'user-1')
    assert.equal(task.status, 'COMPLETED')
    assert.deepEqual(updateInput.changes, { status: 'COMPLETED', priority: 'HIGH' })
    assert.deepEqual(scheduledTask, task)
})

test('project task service cancels deadline notifications after task deletion', async () => {
    let cancelledTaskId
    const service = createProjectTaskService({
        async deleteForManager() {
            return { id: 'task-1', projectId: 'project-1', deleted: true }
        },
    }, {
        async schedule() {},
        async cancel(taskId) {
            cancelledTaskId = taskId
        },
    })

    await service.remove('task-1', 'manager-1')

    assert.equal(cancelledTaskId, 'task-1')
})

test('project task reviews require feedback for rejection and changes requests', async () => {
    let reviewCallCount = 0
    const service = createProjectTaskService({
        async reviewTask() {
            reviewCallCount += 1
            return { task: { id: 'task-1', title: 'Ship API', status: 'IN_PROGRESS' }, notifications: [] }
        },
    })

    await assert.rejects(
        service.review('task-1', { action: 'REJECT' }, 'manager-1'),
        (error) => error.statusCode === 400,
    )
    await assert.rejects(
        service.review('task-1', { action: 'REQUEST_CHANGES' }, 'manager-1'),
        (error) => error.statusCode === 400,
    )
    assert.equal(reviewCallCount, 0)
})

test('project task submissions require completion details', async () => {
    let submitCallCount = 0
    const service = createProjectTaskService({
        async submitForReview() {
            submitCallCount += 1
            return { task: { id: 'task-1', status: 'IN_REVIEW' }, notifications: [] }
        },
    })

    await assert.rejects(
        service.submitForReview('task-1', { submissionDetails: '  ' }, 'developer-1'),
        (error) => error.statusCode === 400,
    )
    assert.equal(submitCallCount, 0)
})

test('project task review actions are normalized before persistence', async () => {
    let reviewInput
    const service = createProjectTaskService({
        async reviewTask(input) {
            reviewInput = input
            return { task: { id: 'task-1', title: 'Ship API', status: 'IN_PROGRESS' }, notifications: [] }
        },
    })

    await service.review('task-1', { action: 'request_changes', feedback: 'Please update the API docs.' }, 'manager-1')

    assert.deepEqual(reviewInput, {
        taskId: 'task-1',
        userId: 'manager-1',
        decision: 'CHANGES_REQUESTED',
        feedback: 'Please update the API docs.',
    })
})
