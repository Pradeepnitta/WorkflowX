import { authenticateRequest } from '../middleware/authenticate.js'

export function registerTaskRoutes({ router, taskController }) {
    router.add('POST', '/api/projects/tasks', (req, res) => {
        const user = authenticateRequest(req)
        return taskController.createProjectTask(req, res, user)
    })

    router.add('GET', '/api/projects/tasks', (req, res, _matches, url) => {
        const user = authenticateRequest(req)
        return taskController.listProjectTasks(req, res, user, url.searchParams.get('projectId'))
    })

    router.addRegex('PATCH', /^\/api\/projects\/tasks\/([^/]+)$/, (req, res, matches) => {
        const user = authenticateRequest(req)
        return taskController.updateProjectTask(req, res, user, matches[1])
    })

    router.add('GET', '/api/tasks', (req, res, _matches, url) => {
        return taskController.listGeneralTasks(req, res, url.searchParams)
    })

    router.add('POST', '/api/tasks', (req, res) => {
        return taskController.createGeneralTask(req, res)
    })

    router.addRegex('PATCH', /^\/api\/tasks\/([^/]+)$/, (req, res, matches) => {
        return taskController.updateGeneralTask(req, res, matches[1])
    })

    router.addRegex('DELETE', /^\/api\/tasks\/([^/]+)$/, (req, res, matches) => {
        return taskController.deleteGeneralTask(req, res, matches[1])
    })
}

