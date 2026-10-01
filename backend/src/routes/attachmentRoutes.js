import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAttachmentRoutes({ router, attachmentController, commentController }) {
    if (attachmentController) {
        router.post('/api/projects/tasks/:taskId/attachments', async (req, res) => {
            const user = authenticateRequest(req)
            await attachmentController.uploadAttachment(req, res, user, req.params.taskId)
        })

        router.get('/api/projects/tasks/:taskId/attachments', async (req, res) => {
            authenticateRequest(req)
            await attachmentController.listAttachments(req, res, req.params.taskId)
        })

        router.delete('/api/attachments/:attachmentId', async (req, res) => {
            authenticateRequest(req)
            await attachmentController.removeAttachment(req, res, req.params.attachmentId)
        })
    }

    if (commentController) {
        router.post('/api/projects/tasks/:taskId/comments', async (req, res) => {
            const user = authenticateRequest(req)
            await commentController.createComment(req, res, user, req.params.taskId)
        })

        router.get('/api/projects/tasks/:taskId/comments', async (req, res) => {
            const user = authenticateRequest(req)
            await commentController.listComments(req, res, user, req.params.taskId)
        })

        router.patch('/api/comments/:commentId', async (req, res) => {
            const user = authenticateRequest(req)
            await commentController.updateComment(req, res, user, req.params.commentId)
        })

        router.delete('/api/comments/:commentId', async (req, res) => {
            const user = authenticateRequest(req)
            await commentController.removeComment(req, res, user, req.params.commentId)
        })
    }
}
