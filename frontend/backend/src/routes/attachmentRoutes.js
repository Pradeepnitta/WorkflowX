import { authenticateRequest } from '../middleware/authenticate.js'

export function registerAttachmentRoutes({ router, attachmentController, commentController }) {
    if (attachmentController) {
        router.addRegex('POST', /^\/api\/projects\/tasks\/([^/]+)\/attachments$/, (req, res, matches) => {
            const user = authenticateRequest(req)
            return attachmentController.uploadAttachment(req, res, user, matches[1])
        })

        router.addRegex('GET', /^\/api\/projects\/tasks\/([^/]+)\/attachments$/, (req, res, matches) => {
            authenticateRequest(req)
            return attachmentController.listAttachments(req, res, matches[1])
        })

        router.addRegex('DELETE', /^\/api\/attachments\/([^/]+)$/, (req, res, matches) => {
            authenticateRequest(req)
            return attachmentController.removeAttachment(req, res, matches[1])
        })
    }

    if (commentController) {
        router.addRegex('POST', /^\/api\/projects\/tasks\/([^/]+)\/comments$/, (req, res, matches) => {
            const user = authenticateRequest(req)
            return commentController.createComment(req, res, user, matches[1])
        })

        router.addRegex('GET', /^\/api\/projects\/tasks\/([^/]+)\/comments$/, (req, res, matches) => {
            const user = authenticateRequest(req)
            return commentController.listComments(req, res, user, matches[1])
        })

        router.addRegex('PATCH', /^\/api\/comments\/([^/]+)$/, (req, res, matches) => {
            const user = authenticateRequest(req)
            return commentController.updateComment(req, res, user, matches[1])
        })

        router.addRegex('DELETE', /^\/api\/comments\/([^/]+)$/, (req, res, matches) => {
            const user = authenticateRequest(req)
            return commentController.removeComment(req, res, user, matches[1])
        })
    }
}
