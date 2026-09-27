export function createTaskController({ projectTaskService, createTask, listTasks, updateTask, deleteTask, sendJson, readBody, getIO }) {
    return {
        async listProjectTasks(request, response, user, projectId) {
            const data = await projectTaskService.list(projectId, user.sub)
            sendJson(response, 200, { data })
        },

        async createProjectTask(request, response, user) {
            const input = await readBody(request)
            const data = await projectTaskService.create(input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)
            sendJson(response, 201, { data })
        },

        async updateProjectTask(request, response, user, taskId) {
            const input = await readBody(request)
            const data = await projectTaskService.update(taskId, input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)
            sendJson(response, 200, { data })
        },

        async listGeneralTasks(request, response, searchParams) {
            const data = await listTasks(searchParams)
            sendJson(response, 200, data)
        },

        async createGeneralTask(request, response) {
            const input = await readBody(request)
            const data = await createTask(input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:created', data)
            sendJson(response, 201, { data })
        },

        async updateGeneralTask(request, response, taskId) {
            const input = await readBody(request)
            const data = await updateTask(taskId, input)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:updated', data)
            sendJson(response, 200, { data })
        },

        async deleteGeneralTask(request, response, taskId) {
            const data = await deleteTask(taskId)
            const io = getIO ? getIO() : null
            if (io) io.emit('task:deleted', { id: taskId })
            sendJson(response, 200, { data })
        },
    }
}

