import assert from 'node:assert/strict'
import test from 'node:test'
import { createCommentService } from '../src/services/commentService.js'

test('comment service creates comments and lists replies', async () => {
    const comments = []
    const repository = {
        async createForTask(input) {
            const comment = { id: `comment-${comments.length + 1}`, ...input, authorId: input.userId, author: { id: input.userId, name: 'Jordan Davis', email: 'jordan@example.com' }, createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z' }
            comments.push(comment)
            return comment
        },
        async findForTask(input) {
            assert.deepEqual(input, { taskId: 'task-1', userId: 'user-1' })
            return comments
        },
    }
    const service = createCommentService(repository)

    const comment = await service.create('task-1', { content: ' Ship it! ' }, 'user-1')
    const reply = await service.create('task-1', { content: ' Agreed. ', parentId: comment.id }, 'user-1')
    const listed = await service.list('task-1', 'user-1')

    assert.equal(comment.content, 'Ship it!')
    assert.equal(reply.content, 'Agreed.')
    assert.equal(reply.parentId, 'comment-1')
    assert.equal(listed.length, 2)
})

test('comment service validates content and identity', async () => {
    const service = createCommentService({})

    await assert.rejects(service.create('task-1', { content: '' }, 'user-1'), (error) => error.statusCode === 400)
    await assert.rejects(service.list('task-1'), (error) => error.statusCode === 401)
})

test('comment service updates and removes comments', async () => {
    const calls = []
    const service = createCommentService({
        async update(input) {
            calls.push({ method: 'update', input })
            return { id: input.commentId, content: input.content, taskId: 'task-1', authorId: input.userId, author: null, parentId: null }
        },
        async remove(input) {
            calls.push({ method: 'remove', input })
        },
    })

    const updated = await service.update('comment-1', { content: ' Updated ' }, 'user-1')
    const removed = await service.remove('comment-1', 'user-1')
    assert.equal(updated.content, 'Updated')
    assert.deepEqual(removed, { deleted: true })
    assert.deepEqual(calls.map(({ method }) => method), ['update', 'remove'])
})
