function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentComment(comment) {
    return {
        id: comment.id,
        content: comment.content,
        taskId: comment.taskId,
        authorId: comment.authorId,
        author: comment.author ? { id: comment.author.id, name: comment.author.name, email: comment.author.email } : null,
        parentId: comment.parentId || null,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
    }
}

export function createCommentService(commentRepository) {
    return {
        async create(taskId, input, userId) {
            const content = typeof input.content === 'string' ? input.content.trim() : ''
            const parentId = typeof input.parentId === 'string' ? input.parentId.trim() : null
            if (!taskId) throw serviceError('Task is required', 400)
            if (!content) throw serviceError('Comment content is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            return presentComment(await commentRepository.createForTask({ taskId, userId, content, parentId }))
        },

        async list(taskId, userId) {
            if (!taskId) throw serviceError('Task is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const comments = await commentRepository.findForTask({ taskId, userId })
            return comments.map(presentComment)
        },

        async update(commentId, input, userId) {
            const content = typeof input.content === 'string' ? input.content.trim() : ''
            if (!commentId) throw serviceError('Comment is required', 400)
            if (!content) throw serviceError('Comment content is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            return presentComment(await commentRepository.update({ commentId, userId, content }))
        },

        async remove(commentId, userId) {
            if (!commentId) throw serviceError('Comment is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            await commentRepository.remove({ commentId, userId })
            return { deleted: true }
        },
    }
}
