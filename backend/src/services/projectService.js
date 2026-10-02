import { cacheGet, cacheSet, cacheDel } from '../config/redis.js'

const statuses = new Set(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'])
const visibilities = new Set(['ORGANIZATION', 'MEMBERS_ONLY'])
const priorities = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

const statusAliases = {
    'PLANNED': 'PLANNING',
    'TODO': 'PLANNING',
    'IN_PROGRESS': 'ACTIVE',
    'INPROGRESS': 'ACTIVE',
    'PAUSED': 'ON_HOLD',
    'DONE': 'COMPLETED',
}

const priorityAliases = {
    'CRITICAL': 'URGENT',
    'NORMAL': 'MEDIUM',
}

const visibilityAliases = {
    'PUBLIC': 'ORGANIZATION',
    'WORKSPACE': 'ORGANIZATION',
    'PRIVATE': 'MEMBERS_ONLY',
}

function serviceError(message, statusCode) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function presentProject(project) {
    return {
        id: project.id,
        name: project.name,
        key: project.key || (project.name ? project.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() : 'PROJ'),
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
            const rawKey = typeof input.key === 'string' ? input.key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) : ''
            const key = rawKey || (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase() || 'PROJ')

            const rawStatus = (input.status || 'PLANNING').toString().trim().toUpperCase().replace(/\s+/g, '_')
            const status = statusAliases[rawStatus] || rawStatus

            const rawVisibility = (input.visibility || 'ORGANIZATION').toString().trim().toUpperCase().replace(/\s+/g, '_')
            const visibility = visibilityAliases[rawVisibility] || rawVisibility

            const rawPriority = (input.priority || 'MEDIUM').toString().trim().toUpperCase()
            const priority = priorityAliases[rawPriority] || rawPriority

            let dueDate = null
            if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
                dueDate = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate)
                if (Number.isNaN(dueDate.getTime())) throw serviceError('Due date must be valid', 400)
            }

            if (name.length < 2) throw serviceError('Project name must be at least 2 characters', 400)
            if (!organizationId) throw serviceError('Organization is required', 400)
            if (!statuses.has(status) || !visibilities.has(visibility) || !priorities.has(priority)) throw serviceError('Invalid project options', 400)
            if (!userId) throw serviceError('Authentication required', 401)

            const project = presentProject(await projectRepository.createForMember({ name, key, description, organizationId, userId, status, visibility, priority, dueDate }))
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
            if (input.key !== undefined) {
                const key = typeof input.key === 'string' ? input.key.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) : ''
                if (key) changes.key = key
            }
            if (input.description !== undefined) changes.description = typeof input.description === 'string' ? input.description.trim() : null
            if (input.status !== undefined) {
                const rawStatus = input.status.toString().trim().toUpperCase().replace(/\s+/g, '_')
                const normalizedStatus = statusAliases[rawStatus] || rawStatus
                if (!statuses.has(normalizedStatus)) throw serviceError('Invalid project status', 400)
                changes.status = normalizedStatus
            }
            if (input.visibility !== undefined) {
                const rawVis = input.visibility.toString().trim().toUpperCase().replace(/\s+/g, '_')
                const normalizedVis = visibilityAliases[rawVis] || rawVis
                if (!visibilities.has(normalizedVis)) throw serviceError('Invalid project visibility', 400)
                changes.visibility = normalizedVis
            }
            if (input.priority !== undefined) {
                const rawPri = input.priority.toString().trim().toUpperCase()
                const normalizedPri = priorityAliases[rawPri] || rawPri
                if (!priorities.has(normalizedPri)) throw serviceError('Invalid project priority', 400)
                changes.priority = normalizedPri
            }
            if (input.dueDate !== undefined) {
                if (input.dueDate === null || input.dueDate === '') {
                    changes.dueDate = null
                } else {
                    const parsed = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate)
                    if (Number.isNaN(parsed.getTime())) throw serviceError('Due date must be valid', 400)
                    changes.dueDate = parsed
                }
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

