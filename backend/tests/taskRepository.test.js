import assert from 'node:assert/strict'
import test from 'node:test'
import { readTasks } from '../src/repositories/taskRepository.js'

test('readTasks loads the persisted task collection', async () => {
    const tasks = await readTasks()

    assert.ok(Array.isArray(tasks))
    assert.ok(tasks.length > 0)
    assert.ok(tasks[0].id)
    assert.ok(tasks[0].title)
    assert.ok(tasks[0].status)
    assert.ok(tasks[0].priority)
})
