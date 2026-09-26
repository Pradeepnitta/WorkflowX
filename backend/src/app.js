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
import { errorHandlerMiddleware } from './middleware/index.js'

const maxBodyBytes = 1024 * 1024

function sendJson(response, status, payload) {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(payload))
}

async function readBody(request) {
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

async function handleRequest(request, response, authService, organizationService, teamService, projectService, projectMemberService, projectTaskService, commentService, invitationService, invitationAcceptanceService, notificationService, analyticsService, searchService) {
    const requestUrl = new URL(request.url, 'http://localhost')

    if (request.method === 'OPTIONS') {
        response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' })
        response.end()
        return
    }

    if (request.method === 'GET' && ['/health', '/api/health'].includes(requestUrl.pathname)) {
        sendJson(response, 200, { status: 'healthy', service: 'workflowx-api' })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/') {
        sendJson(response, 200, { message: 'WorkFlowX API is running' })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/auth/me') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: { id: user.sub, email: user.email } })
        return
    }

    if (request.method === 'PATCH' && requestUrl.pathname === '/api/auth/me') {
        const user = authenticateRequest(request)
        const profile = await authService.updateProfile(await readBody(request), user.sub)
        sendJson(response, 200, { data: profile })
        return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/organizations') {
        const user = authenticateRequest(request)
        const organization = await organizationService.create(await readBody(request), user.sub)
        sendJson(response, 201, { data: organization })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/organizations') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await organizationService.list(user.sub) })
        return
    }

    const invitationPath = requestUrl.pathname.match(/^\/api\/organizations\/([^/]+)\/invite$/)
    if (invitationPath && request.method === 'POST') {
        const user = authenticateRequest(request)
        const invitation = await invitationService.create(invitationPath[1], await readBody(request), user.sub)
        sendJson(response, 201, { data: invitation })
        return
    }

    const acceptInvitationPath = requestUrl.pathname.match(/^\/api\/invitations\/([^/]+)\/accept$/)
    if (acceptInvitationPath && request.method === 'POST') {
        const user = authenticateRequest(request)
        const result = await invitationAcceptanceService.accept(acceptInvitationPath[1], user.sub)
        sendJson(response, 200, { data: result })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/notifications') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await notificationService.list(user.sub) })
        return
    }

    const notificationPath = requestUrl.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/)
    if (notificationPath && request.method === 'PATCH') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await notificationService.markRead(notificationPath[1], user.sub) })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/analytics/overview') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await analyticsService.overview(requestUrl.searchParams.get('organizationId'), user.sub) })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/search') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await searchService.search(requestUrl.searchParams.get('organizationId'), requestUrl.searchParams.get('q'), user.sub) })
        return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/teams') {
        const user = authenticateRequest(request)
        const team = await teamService.create(await readBody(request), user.sub)
        sendJson(response, 201, { data: team })
        return
    }

    const teamMemberPath = requestUrl.pathname.match(/^\/api\/teams\/([^/]+)\/members(?:\/([^/]+))?$/)
    if (teamMemberPath && request.method === 'POST' && !teamMemberPath[2]) {
        const user = authenticateRequest(request)
        const input = await readBody(request)
        const membership = await teamService.addMember(teamMemberPath[1], input.userId, user.sub)
        sendJson(response, 201, { data: membership })
        return
    }

    if (teamMemberPath && request.method === 'DELETE' && teamMemberPath[2]) {
        const user = authenticateRequest(request)
        const membership = await teamService.removeMember(teamMemberPath[1], teamMemberPath[2], user.sub)
        sendJson(response, 200, { data: membership })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/teams') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await teamService.list(requestUrl.searchParams.get('organizationId'), user.sub) })
        return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/projects') {
        const user = authenticateRequest(request)
        const project = await projectService.create(await readBody(request), user.sub)
        sendJson(response, 201, { data: project })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/projects') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await projectService.list(requestUrl.searchParams.get('organizationId'), user.sub) })
        return
    }

    const projectPath = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)$/)
    if (projectPath && request.method === 'PATCH') {
        const user = authenticateRequest(request)
        const project = await projectService.update(projectPath[1], await readBody(request), user.sub)
        sendJson(response, 200, { data: project })
        return
    }

    const projectMemberPath = requestUrl.pathname.match(/^\/api\/projects\/([^/]+)\/members(?:\/([^/]+))?$/)
    if (projectMemberPath && request.method === 'POST' && !projectMemberPath[2]) {
        const user = authenticateRequest(request)
        const input = await readBody(request)
        const membership = await projectMemberService.add(projectMemberPath[1], input.userId, user.sub)
        sendJson(response, 201, { data: membership })
        return
    }

    if (projectMemberPath && request.method === 'DELETE' && projectMemberPath[2]) {
        const user = authenticateRequest(request)
        const membership = await projectMemberService.remove(projectMemberPath[1], projectMemberPath[2], user.sub)
        sendJson(response, 200, { data: membership })
        return
    }

    if (projectMemberPath && request.method === 'GET' && !projectMemberPath[2]) {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await projectMemberService.list(projectMemberPath[1], user.sub) })
        return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/projects/tasks') {
        const user = authenticateRequest(request)
        const task = await projectTaskService.create(await readBody(request), user.sub)
        sendJson(response, 201, { data: task })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/projects/tasks') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await projectTaskService.list(requestUrl.searchParams.get('projectId'), user.sub) })
        return
    }

    const projectTaskPath = requestUrl.pathname.match(/^\/api\/projects\/tasks\/([^/]+)$/)
    if (projectTaskPath && request.method === 'PATCH') {
        const user = authenticateRequest(request)
        const task = await projectTaskService.update(projectTaskPath[1], await readBody(request), user.sub)
        sendJson(response, 200, { data: task })
        return
    }

    const commentPath = requestUrl.pathname.match(/^\/api\/projects\/tasks\/([^/]+)\/comments$/)
    if (commentPath && request.method === 'POST') {
        const user = authenticateRequest(request)
        const comment = await commentService.create(commentPath[1], await readBody(request), user.sub)
        sendJson(response, 201, { data: comment })
        return
    }

    if (commentPath && request.method === 'GET') {
        const user = authenticateRequest(request)
        sendJson(response, 200, { data: await commentService.list(commentPath[1], user.sub) })
        return
    }

    const commentResourcePath = requestUrl.pathname.match(/^\/api\/comments\/([^/]+)$/)
    if (commentResourcePath && request.method === 'PATCH') {
        const user = authenticateRequest(request)
        const comment = await commentService.update(commentResourcePath[1], await readBody(request), user.sub)
        sendJson(response, 200, { data: comment })
        return
    }

    if (commentResourcePath && request.method === 'DELETE') {
        const user = authenticateRequest(request)
        const result = await commentService.remove(commentResourcePath[1], user.sub)
        sendJson(response, 200, { data: result })
        return
    }

    if (request.method === 'POST' && ['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout'].includes(requestUrl.pathname)) {
        const input = await readBody(request)
        const result = requestUrl.pathname.endsWith('/register')
            ? await authService.register(input)
            : requestUrl.pathname.endsWith('/login')
                ? await authService.login(input)
                : requestUrl.pathname.endsWith('/refresh')
                    ? await authService.refresh(input)
                    : await authService.logout(input)
        sendJson(response, requestUrl.pathname.endsWith('/register') ? 201 : 200, { data: result })
        return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/tasks') {
        sendJson(response, 200, await listTasks(requestUrl.searchParams))
        return
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/tasks') {
        const input = await readBody(request)
        sendJson(response, 201, { data: await createTask(input) })
        return
    }

    sendJson(response, 404, { error: 'Route not found' })
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
    const routeRequest = createRoutes({
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

    return (request, response) => {
        routeRequest(request, response).catch((error) => {
            errorHandlerMiddleware(error, response, sendJson)
        })
    }
}

