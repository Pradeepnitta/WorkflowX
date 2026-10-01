import express from 'express'
import helmet from 'helmet'
import { createTask, listTasks } from './services/taskService.js'
import { authenticateRequest } from './middleware/authenticate.js'
import { createAuthService } from './services/authService.js'
import { createOtpService } from './services/otpService.js'
import * as userRepository from './repositories/userRepository.js'
import * as refreshTokenRepository from './repositories/refreshTokenRepository.js'
import { createOrganizationService } from './services/organizationService.js'
import * as organizationRepository from './repositories/organizationRepository.js'
import { createTeamService } from './services/teamService.js'
import * as teamRepository from './repositories/teamRepository.js'
import { createProjectService } from './services/projectService.js'
import * as projectRepository from './repositories/projectRepository.js'
import { createProjectMemberService } from './services/projectMemberService.js'
import * as projectMemberRepository from './repositories/projectMemberRepository.js'
import { createProjectTaskService } from './services/projectTaskService.js'
import * as projectTaskRepository from './repositories/projectTaskRepository.js'
import { createCommentService } from './services/commentService.js'
import * as commentRepository from './repositories/commentRepository.js'
import { createAttachmentService } from './services/attachmentService.js'
import * as attachmentRepository from './repositories/attachmentRepository.js'
import { createInvitationService } from './services/invitationService.js'
import * as invitationRepository from './repositories/invitationRepository.js'
import { createInvitationAcceptanceService } from './services/invitationAcceptanceService.js'
import * as invitationAcceptanceRepository from './repositories/invitationAcceptanceRepository.js'
import { createNotificationService } from './services/notificationService.js'
import * as notificationRepository from './repositories/notificationRepository.js'
import { createAnalyticsService } from './services/analyticsService.js'
import * as analyticsRepository from './repositories/analyticsRepository.js'
import { createSearchService } from './services/searchService.js'
import * as searchRepository from './repositories/searchRepository.js'
import { createRoutes } from './routes/index.js'
import {
    corsMiddleware,
    loggerMiddleware,
    rateLimiterMiddleware,
    errorHandlerMiddleware,
} from './middleware/index.js'

const maxBodyBytes = 1024 * 1024

export function sendJson(response, status, payload) {
    if (typeof response.status === 'function' && typeof response.json === 'function') {
        response.setHeader('Cache-Control', 'no-store')
        if (status === 204) {
            response.status(204).end()
            return
        }
        response.status(status).json(payload)
    } else {
        response.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store',
        })
        if (status === 204) {
            response.end()
            return
        }
        response.end(JSON.stringify(payload))
    }
}

export async function readBody(request) {
    if (request.body && typeof request.body === 'object') {
        return request.body
    }
    if (typeof request.body === 'string') {
        try {
            return JSON.parse(request.body || '{}')
        } catch {
            const error = new Error('Request body must be valid JSON')
            error.statusCode = 400
            throw error
        }
    }

    let body = ''
    let bodyBytes = 0
    if (request[Symbol.asyncIterator]) {
        for await (const chunk of request) {
            bodyBytes += Buffer.byteLength(chunk)
            if (bodyBytes > maxBodyBytes) {
                const error = new Error('Request body is too large')
                error.statusCode = 413
                throw error
            }
            body += chunk
        }
    }
    try {
        return JSON.parse(body || '{}')
    } catch {
        const error = new Error('Request body must be valid JSON')
        error.statusCode = 400
        throw error
    }
}

export function createApp({
    otpService = createOtpService({ userRepository }),
    authService = createAuthService(userRepository, refreshTokenRepository, otpService),
    organizationService = createOrganizationService(organizationRepository),
    teamService = createTeamService(teamRepository),
    projectService = createProjectService(projectRepository),
    projectMemberService = createProjectMemberService(projectMemberRepository),
    projectTaskService = createProjectTaskService(projectTaskRepository),
    commentService = createCommentService(commentRepository),
    attachmentService = createAttachmentService(attachmentRepository),
    invitationService = createInvitationService(invitationRepository),
    invitationAcceptanceService = createInvitationAcceptanceService(invitationAcceptanceRepository),
    notificationService = createNotificationService(notificationRepository),
    analyticsService = createAnalyticsService(analyticsRepository),
    searchService = createSearchService(searchRepository),
} = {}) {
    const app = express()

    app.disable('x-powered-by')

    // Standard Express Middlewares
    app.use(corsMiddleware)
    app.use(helmet({
        crossOriginResourcePolicy: false,
    }))
    app.use(loggerMiddleware)
    app.use(rateLimiterMiddleware)
    app.use(express.json({ limit: '1mb' }))

    // Register API & feature routes
    const router = createRoutes({
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
    })

    app.use(router)

    // 404 Route Not Found
    app.use((req, res) => {
        sendJson(res, 404, { error: 'Route not found' })
    })

    // Central Error Handler
    app.use((err, req, res, next) => {
        errorHandlerMiddleware(err, req, res, next)
    })

    return app
}
