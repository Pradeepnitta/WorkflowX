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

    router.get('/api/tasks', async (req, res) => {
        const url = new URL(req.originalUrl || req.url, 'http://localhost')
        await taskController.listGeneralTasks(req, res, url.searchParams)
    })

    router.post('/api/tasks', async (req, res) => {
        await taskController.createGeneralTask(req, res)
    })

    router.patch('/api/tasks/:taskId', async (req, res) => {
        await taskController.updateGeneralTask(req, res, req.params.taskId)
    })

    router.delete('/api/tasks/:taskId', async (req, res) => {
        await taskController.deleteGeneralTask(req, res, req.params.taskId)
    })
}
