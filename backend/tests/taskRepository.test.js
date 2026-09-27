import assert from 'node:assert/strict'
import test from 'node:test'
import { readTasks, saveTasks } from '../src/repositories/taskRepository.js'

test('readTasks loads the persisted task collection', async () => {
    const initialTasks = await readTasks()
    assert.ok(Array.isArray(initialTasks))

    await saveTasks([{ id: 999999, title: 'Test Task', status: 'Todo', priority: 'High' }])
    const tasks = await readTasks()
    assert.ok(Array.isArray(tasks))
    assert.ok(tasks.length > 0)
    assert.equal(tasks[0].id, 999999)
    assert.equal(tasks[0].title, 'Test Task')
    assert.equal(tasks[0].status, 'Todo')
    assert.equal(tasks[0].priority, 'High')

    await saveTasks(initialTasks)
})
