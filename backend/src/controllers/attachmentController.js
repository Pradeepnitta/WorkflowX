export function createAttachmentController({ attachmentService, sendJson, readBody }) {
    return {
        async uploadAttachment(request, response, user, taskId) {
            const input = await readBody(request)
            const attachment = await attachmentService.uploadAttachment(taskId, input, user.sub)
            sendJson(response, 201, { data: attachment })
        },

        async listAttachments(request, response, taskId) {
            const attachments = await attachmentService.listAttachments(taskId)
            sendJson(response, 200, { data: attachments })
        },

        async removeAttachment(request, response, attachmentId) {
            const result = await attachmentService.removeAttachment(attachmentId)
            sendJson(response, 200, { data: result })
        },
    }
}

export function createCommentController({ commentService, sendJson, readBody, getIO }) {
    return {
        async listComments(request, response, user, taskId) {
            const data = await commentService.list(taskId, user.sub)
            sendJson(response, 200, { data })
        },

        async createComment(request, response, user, taskId) {
            const input = await readBody(request)
            const data = await commentService.create(taskId, input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('comment:created', { taskId, comment: data, user })
            sendJson(response, 201, { data })
        },

        async updateComment(request, response, user, commentId) {
            const input = await readBody(request)
            const data = await commentService.update(commentId, input, user.sub)
            sendJson(response, 200, { data })
        },

        async removeComment(request, response, user, commentId) {
            const data = await commentService.remove(commentId, user.sub)
            sendJson(response, 200, { data })
        },
    }
}
