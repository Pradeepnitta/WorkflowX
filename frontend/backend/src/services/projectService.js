import { cacheGet, cacheSet, cacheDel } from '../config/redis.js'

const statuses = new Set(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'])
const visibilities = new Set(['ORGANIZATION', 'MEMBERS_ONLY'])
const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentProject(project) {
    return {
        id: project.id,
        name: project.name,
        description: project.description || null,
        status: project.status,
        visibility: project.visibility,
        priority: project.priority,
        organizationId: project.organizationId,
        createdById: project.createdById,
        startDate: project.startDate || null,
        dueDate: project.dueDate || null,
    }
}

export function createProjectService(projectRepository) {
    return {
        async create(input, userId) {
            const name = typeof input.name === 'string' ? input.name.trim() : ''
            const description = typeof input.description === 'string' ? input.description.trim() : null
            const organizationId = typeof input.organizationId === 'string' ? input.organizationId.trim() : ''
            const status = input.status || 'PLANNING'
            const visibility = input.visibility || 'ORGANIZATION'
            const priority = input.priority || 'MEDIUM'
            const dueDate = input.dueDate ? new Date(input.dueDate) : null

            if (name.length < 2) throw serviceError('Project name must be at least 2 characters', 400)
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!statuses.has(status) || !visibilities.has(visibility) || !priorities.has(priority)) throw serviceError('Invalid project options', 400)
            if (dueDate && Number.isNaN(dueDate.getTime())) throw serviceError('Due date must be valid', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const project = presentProject(await projectRepository.createForMember({ name, description, organizationId, userId, status, visibility, priority, dueDate }))
            await cacheDel(`projects:${organizationId}:${userId}`)
            return project
        },

        async list(organizationId, userId) {
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const cacheKey = `projects:${organizationId}:${userId}`
            const cachedProjects = await cacheGet(cacheKey)
            if (cachedProjects) {
                return cachedProjects
            }

            const projects = await projectRepository.findForMember({ organizationId, userId })
            const presented = projects.map(presentProject)
            await cacheSet(cacheKey, presented, 60)
            return presented
        },

        async update(projectId, input, userId) {
            if (!projectId) throw serviceError('Project is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)
            const changes = {}
            if (input.name !== undefined) {
                changes.name = typeof input.name === 'string' ? input.name.trim() : ''
                if (changes.name.length < 2) throw serviceError('Project name must be at least 2 characters', 400)
            }
            if (input.description !== undefined) changes.description = typeof input.description === 'string' ? input.description.trim() : null
            if (input.status !== undefined) {
                if (!statuses.has(input.status)) throw serviceError('Invalid project status', 400)
                changes.status = input.status
            }
            if (input.visibility !== undefined) {
                if (!visibilities.has(input.visibility)) throw serviceError('Invalid project visibility', 400)
                changes.visibility = input.visibility
            }
            if (input.priority !== undefined) {
                if (!priorities.has(input.priority)) throw serviceError('Invalid project priority', 400)
                changes.priority = input.priority
            }
            if (input.dueDate !== undefined) {
                changes.dueDate = input.dueDate ? new Date(input.dueDate) : null
                if (changes.dueDate && Number.isNaN(changes.dueDate.getTime())) throw serviceError('Due date must be valid', 400)
            }
            if (Object.keys(changes).length === 0) throw serviceError('At least one project field is required', 400)

            const updatedProject = presentProject(await projectRepository.updateForManager({ projectId, userId, changes }))
            if (updatedProject.organizationId) {
                await cacheDel(`projects:${updatedProject.organizationId}:${userId}`)
            }
            return updatedProject
        },

        async remove(projectId, userId) {
            if (!projectId) throw serviceError('Project is required', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const project = await projectRepository.deleteForManager({ projectId, userId })
            if (project?.organizationId) {
                await cacheDel(`projects:${project.organizationId}:${userId}`)
            }
            return { id: projectId, deleted: true }
        },
    }
}

