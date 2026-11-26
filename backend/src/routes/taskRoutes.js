import { authenticateRequest } from '../middleware/authenticate.js'

export function registerTaskRoutes({ router, taskController }) {
    router.post('/api/projects/tasks', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.createProjectTask(req, res, user)
    })

    router.get('/api/projects/tasks', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.listProjectTasks(req, res, user, req.query.projectId)
    })

    router.patch('/api/projects/tasks/:taskId', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.updateProjectTask(req, res, user, req.params.taskId)
    })

    router.delete('/api/projects/tasks/:taskId', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.deleteProjectTask(req, res, user, req.params.taskId)
    })

    router.post('/api/projects/tasks/:taskId/review', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.submitProjectTaskForReview(req, res, user, req.params.taskId)
    })

    router.post('/api/projects/tasks/:taskId/reviews', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.reviewProjectTask(req, res, user, req.params.taskId)
    })

    router.get('/api/projects/tasks/:taskId/reviews', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.listProjectTaskReviews(req, res, user, req.params.taskId)
    })

    router.get('/api/tasks', async (req, res) => {
        const url = new URL(req.originalUrl || req.url, 'http://localhost')
        const user = authenticateRequest(req)
        await taskController.listGeneralTasks(req, res, url.searchParams, user)
    })

    router.post('/api/tasks', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.createGeneralTask(req, res, user)
    })

    router.patch('/api/tasks/:taskId', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.updateGeneralTask(req, res, req.params.taskId, user)
    })

    router.delete('/api/tasks/:taskId', async (req, res) => {
        const user = authenticateRequest(req)
        await taskController.deleteGeneralTask(req, res, req.params.taskId, user)
    })
}
