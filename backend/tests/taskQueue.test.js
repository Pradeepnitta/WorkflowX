import assert from 'node:assert/strict'
import test from 'node:test'
import { getTaskDeadlineJobs } from '../src/jobs/taskQueue.js'

test('deadline scheduler prepares an approaching reminder and overdue notice for task stakeholders', () => {
    const now = Date.parse('2026-11-26T00:00:00.000Z')
    const dueDate = '2026-11-28T00:00:00.000Z'
    const jobs = getTaskDeadlineJobs({
        id: 'task-1',
        title: 'Ship API',
        status: 'IN_PROGRESS',
        dueDate,
        assigneeId: 'developer-1',
        createdById: 'manager-1',
    }, now)

    assert.deepEqual(jobs.map(({ name, delay }) => ({ name, delay })), [
        { name: 'DEADLINE_REMINDER', delay: 24 * 60 * 60 * 1000 },
        { name: 'TASK_OVERDUE', delay: 48 * 60 * 60 * 1000 },
    ])
    assert.deepEqual(jobs[0].payload.userIds, ['developer-1', 'manager-1'])
    assert.deepEqual(jobs[0].payload, jobs[1].payload)
})

test('deadline scheduler skips completed tasks and deduplicates stakeholders', () => {
    const task = {
        id: 'task-1',
        status: 'COMPLETED',
        dueDate: '2026-11-28T00:00:00.000Z',
        assigneeId: 'manager-1',
        createdById: 'manager-1',
    }

    assert.deepEqual(getTaskDeadlineJobs(task, Date.parse('2026-11-26T00:00:00.000Z')), [])
    assert.deepEqual(getTaskDeadlineJobs({ ...task, status: 'TODO' }, Date.parse('2026-11-26T00:00:00.000Z'))[0].payload.userIds, ['manager-1'])
})
