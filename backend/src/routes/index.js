import { readFileSync } from 'node:fs'
import { createTask, listTasks, updateTask } from '../services/taskService.js'
import { checkRedisHealth } from '../config/redis.js'
import { getIO } from '../sockets/socketServer.js'

import {
    createAuthController,
    createAdminController,
    createOrganizationController,
    createTeamController,
    createProjectController,
    createTaskController,
    createAnalyticsController,
    createNotificationController,
    createSearchController,
    createAttachmentController,
    createCommentController,
} from '../controllers/index.js'
import { registerAuthRoutes } from './authRoutes.js'
import { registerAdminRoutes } from './adminRoutes.js'
import { registerOrganizationRoutes } from './organizationRoutes.js'
import { registerTeamRoutes } from './teamRoutes.js'
import { registerProjectRoutes } from './projectRoutes.js'
import { registerTaskRoutes } from './taskRoutes.js'
import { registerAnalyticsRoutes } from './analyticsRoutes.js'
import { registerNotificationRoutes } from './notificationRoutes.js'
import { registerSearchRoutes } from './searchRoutes.js'
import { registerAttachmentRoutes } from './attachmentRoutes.js'
import { corsMiddleware, loggerMiddleware, rateLimiterMiddleware } from '../middleware/index.js'

let openapiSpec = null
try {
    const specPath = new URL('../docs/openapi.json', import.meta.url)
    openapiSpec = JSON.parse(readFileSync(specPath, 'utf8'))
} catch {
    openapiSpec = { openapi: '3.0.3', info: { title: 'WorkFlowX API', version: '1.0.0' } }
}

class ApiRouter {
    constructor() {
        this.staticRoutes = new Map()
        this.regexRoutes = []
    }

    add(method, path, handler) {
        this.staticRoutes.set(`${method}:${path}`, handler)
    }

    addRegex(method, regex, handler) {
        this.regexRoutes.push({ method, regex, handler })
    }

    async route(request, response, sendJson) {
        const url = new URL(request.url, 'http://localhost')
        const key = `${request.method}:${url.pathname}`

        const staticHandler = this.staticRoutes.get(key)
        if (staticHandler) {
            return staticHandler(request, response, null, url)
        }

        for (const { method, regex, handler } of this.regexRoutes) {
            if (request.method === method) {
                const match = url.pathname.match(regex)
                if (match) {
                    return handler(request, response, match, url)
                }
            }
        }

        sendJson(response, 404, { error: 'Route not found' })
    }
}

export function createRoutes({
    sendJson,
    readBody,
    authService,
    organizationService,
    teamService,
    projectService,
    projectMemberService,
    projectTaskService,
    commentService,
    attachmentService,
    invitationService,
    invitationAcceptanceService,
    notificationService,
    analyticsService,
    searchService,
}) {
    // 1. Initialize Page Controllers
    const authController = createAuthController({ authService, sendJson, readBody })
    const adminController = createAdminController({ organizationService, sendJson, readBody })
    const orgController = createOrganizationController({ organizationService, invitationService, invitationAcceptanceService, sendJson, readBody })
    const teamController = createTeamController({ teamService, sendJson, readBody })
    const projectController = createProjectController({ projectService, projectMemberService, sendJson, readBody })
    const taskController = createTaskController({ projectTaskService, createTask, listTasks, updateTask, sendJson, readBody, getIO })
    const analyticsController = createAnalyticsController({ analyticsService, sendJson })
    const notificationController = createNotificationController({ notificationService, sendJson })
    const searchController = createSearchController({ searchService, sendJson })
    const attachmentController = attachmentService ? createAttachmentController({ attachmentService, sendJson, readBody }) : null
    const commentController = createCommentController({ commentService, sendJson, readBody, getIO })

    // 2. Initialize Router & Register modular route modules
    const router = new ApiRouter()

    // Common/Health/Docs routes
    router.add('GET', '/health', async (req, res) => {
        const redisHealth = await checkRedisHealth()
        sendJson(res, 200, { status: 'healthy', service: 'workflowx-api', database: 'connected', redis: redisHealth.status })
    })
    router.add('GET', '/api/health', async (req, res) => {
        const redisHealth = await checkRedisHealth()
        sendJson(res, 200, { status: 'healthy', service: 'workflowx-api', database: 'connected', redis: redisHealth.status })
    })
    router.add('GET', '/api/docs', (req, res) => sendJson(res, 200, openapiSpec))
    router.add('GET', '/docs/swagger.json', (req, res) => sendJson(res, 200, openapiSpec))
    router.add('GET', '/', (req, res) => sendJson(res, 200, { message: 'WorkFlowX API is running' }))

    // Register each page's specific routes
    registerAuthRoutes({ router, authController })
    registerAdminRoutes({ router, adminController })
    registerOrganizationRoutes({ router, orgController })
    registerTeamRoutes({ router, teamController })
    registerProjectRoutes({ router, projectController })
    registerTaskRoutes({ router, taskController })
    registerAnalyticsRoutes({ router, analyticsController })
    registerNotificationRoutes({ router, notificationController })
    registerSearchRoutes({ router, searchController })
    registerAttachmentRoutes({ router, attachmentController, commentController })

    return async function routeRequest(request, response) {
        loggerMiddleware(request)
        if (corsMiddleware(request, response)) {
            return
        }
        rateLimiterMiddleware(request)

        await router.route(request, response, sendJson)
    }
}

