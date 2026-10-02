import assert from 'node:assert/strict'
import test from 'node:test'
import { createNotificationService } from '../src/services/notificationService.js'

test('notification service lists and marks user notifications', async () => {
    const calls = []
    const service = createNotificationService({
        async findForUser(userId) {
            calls.push({ method: 'list', userId })
            return [{ id: 'notification-1', type: 'TASK_ASSIGNED', message: 'New task', isRead: false, createdAt: '2026-09-19T00:00:00.000Z' }]
        },
        async markRead(input) {
            calls.push({ method: 'read', ...input })
        },
    })

    const notifications = await service.list('user-1')
    const result = await service.markRead('notification-1', 'user-1')
    assert.equal(notifications[0].isRead, false)
    assert.deepEqual(result, { id: 'notification-1', isRead: true })
    assert.deepEqual(calls.map(({ method }) => method), ['list', 'read'])
})

test('notification service supports markUnread and clearRead', async () => {
    const calls = []
    const service = createNotificationService({
        async markUnread(input) {
            calls.push({ method: 'unread', ...input })
        },
        async clearReadForUser(userId) {
            calls.push({ method: 'clearRead', userId })
        },
    })

    const unreadResult = await service.markUnread('notification-1', 'user-1')
    assert.deepEqual(unreadResult, { id: 'notification-1', isRead: false })

    const clearResult = await service.clearRead('user-1')
    assert.deepEqual(clearResult, { cleared: true })

    assert.deepEqual(calls, [
        { method: 'unread', notificationId: 'notification-1', userId: 'user-1' },
        { method: 'clearRead', userId: 'user-1' },
    ])
})

