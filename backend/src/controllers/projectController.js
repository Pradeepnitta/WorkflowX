import * as organizationRepository from '../repositories/organizationRepository.js'

export function createProjectController({ projectService, projectMemberService, sendJson, readBody, getIO }) {
    return {
        async list(request, response, user, organizationId) {
            if (!organizationId || organizationId === 'undefined') {
                return sendJson(response, 200, { data: [] })
            }
            const data = await projectService.list(organizationId, user.sub)
            sendJson(response, 200, { data })
        },

        async create(request, response, user) {
            const input = await readBody(request)
            if (!input.organizationId || input.organizationId === 'undefined' || input.organizationId === 'org-default') {
                try {
                    const userOrgs = await organizationRepository.findForUser(user.sub)
                    if (userOrgs && userOrgs.length > 0) {
                        input.organizationId = userOrgs[0].id
                    }
                } catch {
                    // ignore if db lookup fails
                }
            }
            const data = await projectService.create(input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('project:created', data)
            sendJson(response, 201, { data })
        },

        async update(request, response, user, projectId) {
            const input = await readBody(request)
            const data = await projectService.update(projectId, input, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('project:updated', data)
            sendJson(response, 200, { data })
        },

        async remove(request, response, user, projectId) {
            const data = await projectService.remove(projectId, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('project:deleted', { id: projectId })
            sendJson(response, 200, { data })
        },

        async listMembers(request, response, user, projectId) {
            const data = await projectMemberService.list(projectId, user.sub)
            sendJson(response, 200, { data })
        },

        async addMember(request, response, user, projectId) {
            const input = await readBody(request)
            const data = await projectMemberService.add(projectId, input.userId, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('project:member_added', { projectId, member: data })
            sendJson(response, 201, { data })
        },

        async removeMember(request, response, user, projectId, userId) {
            const data = await projectMemberService.remove(projectId, userId, user.sub)
            const io = getIO ? getIO() : null
            if (io) io.emit('project:member_removed', { projectId, userId })
            sendJson(response, 200, { data })
        },
    }
}
