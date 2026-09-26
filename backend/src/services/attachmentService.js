import * as attachmentRepository from '../repositories/attachmentRepository.js'

export function createAttachmentService(repository = attachmentRepository) {
    return {
        async uploadAttachment(taskId, payload, userId) {
            if (!taskId || typeof taskId !== 'string') {
                const error = new Error('Task ID is required')
                error.statusCode = 400
                throw error
            }
            if (!payload || !payload.fileName) {
                const error = new Error('Attachment must include fileName')
                error.statusCode = 400
                throw error
            }
            const storageKey = `tasks/${taskId}/${Date.now()}-${payload.fileName}`
            const fileUrl = payload.fileUrl || `https://workflowx-storage.s3.amazonaws.com/${storageKey}`

            const attachment = await repository.createAttachment({
                taskId,
                uploadedById: userId,
                fileName: payload.fileName,
                storageKey,
                fileUrl,
                fileType: payload.fileType || 'application/octet-stream',
                fileSize: payload.fileSize || 0,
            })

            return attachment
        },

        async listAttachments(taskId) {
            if (!taskId) {
                const error = new Error('Task ID is required')
                error.statusCode = 400
                throw error
            }
            return repository.findAttachmentsByTask(taskId)
        },

        async removeAttachment(attachmentId) {
            if (!attachmentId) {
                const error = new Error('Attachment ID is required')
                error.statusCode = 400
                throw error
            }
            const existing = await repository.findAttachmentById(attachmentId)
            if (!existing) {
                const error = new Error('Attachment not found')
                error.statusCode = 404
                throw error
            }
            return repository.deleteAttachment(attachmentId)
        },
    }
}
