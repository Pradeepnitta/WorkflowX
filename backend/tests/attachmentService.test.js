import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAttachmentService } from '../src/services/attachmentService.js'

test('attachment service uploads attachment metadata', async () => {
    let created = null
    const mockRepo = {
        async createAttachment(data) {
            created = { id: 'att-123', ...data }
            return created
        },
    }
    const service = createAttachmentService(mockRepo)
    const result = await service.uploadAttachment('task-1', { fileName: 'design.pdf', fileSize: 1024 }, 'user-1')
    assert.equal(result.id, 'att-123')
    assert.equal(created.fileName, 'design.pdf')
    assert.equal(created.taskId, 'task-1')
    assert.equal(created.uploadedById, 'user-1')
})

test('attachment service lists and removes attachments', async () => {
    let deletedId = null
    const mockRepo = {
        async findAttachmentsByTask(taskId) {
            return [{ id: 'att-1', taskId, fileName: 'spec.docx' }]
        },
        async findAttachmentById(id) {
            return { id, fileName: 'spec.docx' }
        },
        async deleteAttachment(id) {
            deletedId = id
            return { id }
        },
    }
    const service = createAttachmentService(mockRepo)
    const list = await service.listAttachments('task-1')
    assert.equal(list.length, 1)
    assert.equal(list[0].fileName, 'spec.docx')

    await service.removeAttachment('att-1')
    assert.equal(deletedId, 'att-1')
})
