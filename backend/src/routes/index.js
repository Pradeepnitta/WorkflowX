import { readFileSync } from 'node:fs'
import { createTask, listTasks, updateTask, deleteTask } from '../services/taskService.js'
import { checkRedisHealth } from '../config/redis.js'
import { pool } from '../config/db.js'
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
import { Router } from 'express'
import { corsMiddleware, loggerMiddleware, rateLimiterMiddleware } from '../middleware/index.js'

let openapiSpec = null
try {
    const specPath = new URL('../docs/openapi.json', import.meta.url)
    openapiSpec = JSON.parse(readFileSync(specPath, 'utf8'))
} catch {
    openapiSpec = { openapi: '3.0.3', info: { title: 'WorkFlowX API', version: '1.0.0' } }
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
    const orgController = createOrganizationController({ organizationService, invitationService, invitationAcceptanceService, sendJson, readBody, getIO })
    const teamController = createTeamController({ teamService, sendJson, readBody })
    const projectController = createProjectController({ projectService, projectMemberService, sendJson, readBody, getIO })
    const taskController = createTaskController({ projectTaskService, createTask, listTasks, updateTask, deleteTask, sendJson, readBody, getIO })
    const analyticsController = createAnalyticsController({ analyticsService, sendJson })
    const notificationController = createNotificationController({ notificationService, sendJson })
    const searchController = createSearchController({ searchService, sendJson })
    const attachmentController = attachmentService ? createAttachmentController({ attachmentService, sendJson, readBody }) : null
    const commentController = createCommentController({ commentService, sendJson, readBody, getIO })

    // 2. Initialize Express Router & Register modular route modules
    const router = Router()

    router.add = (method, path, handler) => {
        const fn = method.toLowerCase()
        router[fn](path, async (req, res, next) => {
            try {
                const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || 'localhost'}`)
                await handler(req, res, null, url)
            } catch (err) {
                next(err)
            }
        })
    }

    router.addRegex = (method, regex, handler) => {
        const fn = method.toLowerCase()
        router[fn](regex, async (req, res, next) => {
            try {
                const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || 'localhost'}`)
                const matches = req.path.match(regex) || url.pathname.match(regex)
                await handler(req, res, matches, url)
            } catch (err) {
                next(err)
            }
        })
    }

    router.get('/health', async (req, res) => {
        let dbStatus = 'connected'
        let dbError = null
        try {
            await pool.query('SELECT 1')
        } catch (err) {
            dbStatus = 'disconnected'
            dbError = err.message
        }
        const redisHealth = await checkRedisHealth()
        sendJson(res, 200, {
            status: dbStatus === 'connected' ? 'healthy' : 'degraded',
            service: 'workflowx-api',
            database: dbStatus,
            databaseError: dbError,
            hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
            hasGmailUser: Boolean(process.env.GMAIL_USER || process.env.MAIL_USER),
            hasGmailPass: Boolean(process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS),
            redis: redisHealth.status,
        })
    })

    router.get('/api/health', async (req, res) => {
        let dbStatus = 'connected'
        let dbError = null
        try {
            await pool.query('SELECT 1')
        } catch (err) {
            dbStatus = 'disconnected'
            dbError = err.message
        }
        const redisHealth = await checkRedisHealth()
        sendJson(res, 200, {
            status: dbStatus === 'connected' ? 'healthy' : 'degraded',
            message: 'server health is ok',
            service: 'workflowx-api',
            database: dbStatus,
            databaseError: dbError,
            hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
            hasGmailUser: Boolean(process.env.GMAIL_USER || process.env.MAIL_USER),
            hasGmailPass: Boolean(process.env.GMAIL_APP_PASSWORD || process.env.MAIL_PASS),
            redis: redisHealth.status,
        })
    })

    router.get('/test', (req, res) => sendJson(res, 200, { status: 'ok', message: 'server health is ok' }))
    router.get('/test-health', (req, res) => sendJson(res, 200, { status: 'ok', message: 'server health is ok' }))
    router.get('/api/test', (req, res) => sendJson(res, 200, { status: 'ok', message: 'server health is ok' }))
    router.get('/api/test-health', (req, res) => sendJson(res, 200, { status: 'ok', message: 'server health is ok' }))
    router.get('/api/docs', (req, res) => sendJson(res, 200, openapiSpec))
    router.get('/docs/swagger.json', (req, res) => sendJson(res, 200, openapiSpec))
    router.get('/', (req, res) => sendJson(res, 200, { message: 'WorkFlowX API is running' }))

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

    return router
}

