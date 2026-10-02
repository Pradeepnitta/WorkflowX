import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { createApp } from '../src/app.js'
import { readTasks, saveTasks } from '../src/repositories/taskRepository.js'
import { createAccessToken } from '../src/utils/token.js'

process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-only-workflowx-secret'

async function startTestServer(options) {
    const server = createServer(createApp(options))
    await new Promise((resolve) => server.listen(0, resolve))
    const address = server.address()
    return { server, baseUrl: `http://127.0.0.1:${address.port}` }
}

async function stopTestServer(server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test('app serves health and tasks without starting the production listener', async () => {
    const { server, baseUrl } = await startTestServer()
    const initialTasks = await readTasks()

    try {
        await saveTasks([
            { id: 1, title: 'Audit API permissions', status: 'Todo', priority: 'High' },
            { id: 2, title: 'Security review', status: 'Todo', priority: 'High' },
        ])

        const rootResponse = await fetch(`${baseUrl}/`)
        const root = await rootResponse.json()
        const healthResponse = await fetch(`${baseUrl}/health`)
        const health = await healthResponse.json()
        const apiHealthResponse = await fetch(`${baseUrl}/api/health`)
        const preflightResponse = await fetch(`${baseUrl}/api/auth/me`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Headers': 'Authorization' },
        })
        const tasksResponse = await fetch(`${baseUrl}/api/tasks`)
        const tasks = await tasksResponse.json()
        const filteredResponse = await fetch(`${baseUrl}/api/tasks?status=todo&priority=high&limit=1`)
        const filteredTasks = await filteredResponse.json()

        assert.equal(rootResponse.status, 200)
        assert.deepEqual(root, { message: 'WorkFlowX API is running' })
        assert.equal(healthResponse.status, 200)
        assert.equal(health.status, 'healthy')
        assert.equal(apiHealthResponse.status, 200)
        assert.equal(preflightResponse.status, 204)
        assert.match(preflightResponse.headers.get('access-control-allow-headers'), /Authorization/)
        assert.equal(tasksResponse.status, 200)
        assert.ok(Array.isArray(tasks.data))

        const token = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
        const meResponse = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
        const me = await meResponse.json()
        assert.equal(meResponse.status, 200)
        assert.deepEqual(me.data, { id: 'user-123', email: 'admin@example.com' })
        assert.equal(filteredResponse.status, 200)
        assert.equal(filteredTasks.data.length, 1)
        assert.equal(filteredTasks.data[0].status, 'Todo')
        assert.equal(filteredTasks.data[0].priority, 'High')
        assert.ok(filteredTasks.meta.total >= 2)
        assert.equal(filteredTasks.meta.limit, 1)

        const searchResponse = await fetch(`${baseUrl}/api/tasks?q=permissions`)
        const searchTasks = await searchResponse.json()
        assert.equal(searchResponse.status, 200)
        assert.equal(searchTasks.meta.total, 1)
        assert.equal(searchTasks.data[0].title, 'Audit API permissions')
    } finally {
        await saveTasks(initialTasks)
        await stopTestServer(server)
    }
})

test('app rejects invalid task creation and unknown routes', async () => {
    const { server, baseUrl } = await startTestServer()

    try {
        const invalidTaskResponse = await fetch(`${baseUrl}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '' }),
        })
        const invalidTask = await invalidTaskResponse.json()
        const malformedBodyResponse = await fetch(`${baseUrl}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{"title":',
        })
        const malformedBody = await malformedBodyResponse.json()
        const oversizedBodyResponse = await fetch(`${baseUrl}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'x'.repeat(1024 * 1024) }),
        })
        const oversizedBody = await oversizedBodyResponse.json()
        const missingRouteResponse = await fetch(`${baseUrl}/api/missing`)

        assert.equal(invalidTaskResponse.status, 400)
        assert.equal(invalidTask.error, 'Task title is required')
        assert.equal(malformedBodyResponse.status, 400)
        assert.equal(malformedBody.error, 'Request body must be valid JSON')
        assert.equal(oversizedBodyResponse.status, 413)
        assert.equal(oversizedBody.error, 'Request body is too large')
        assert.equal(missingRouteResponse.status, 404)
    } finally {
        await stopTestServer(server)
    }
})

test('app routes registration and login through the auth service', async () => {
    const calls = []
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const authService = {
        async register(input) {
            calls.push({ method: 'register', input })
            return { user: { id: 'user-1', email: input.email }, accessToken: 'register-token' }
        },
        async login(input) {
            calls.push({ method: 'login', input })
            return { user: { id: 'user-1', email: input.email }, accessToken: 'login-token' }
        },
        async refresh(input) {
            calls.push({ method: 'refresh', input })
            return { user: { id: 'user-1', email: 'jordan@example.com' }, accessToken: 'refreshed-token', refreshToken: 'next-refresh-token' }
        },
        async logout(input) {
            calls.push({ method: 'logout', input })
            return { loggedOut: true }
        },
        async updateProfile(input, userId) {
            assert.deepEqual([input.name, input.avatarUrl, userId], ['Jordan Updated', null, 'user-123'])
            return { id: userId, name: input.name, email: 'admin@example.com', avatarUrl: input.avatarUrl }
        },
    }
    const { server, baseUrl } = await startTestServer({ authService })

    try {
        const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Jordan Davis', email: 'jordan@example.com', password: 'correct horse' }),
        })
        const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'jordan@example.com', password: 'correct horse' }),
        })
        const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: 'login-refresh-token' }),
        })
        const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: 'login-refresh-token' }),
        })

        assert.equal(registerResponse.status, 201)
        assert.equal(loginResponse.status, 200)
        assert.equal(refreshResponse.status, 200)
        assert.equal(logoutResponse.status, 200)
        assert.deepEqual(calls.map((call) => call.method), ['register', 'login', 'refresh', 'logout'])

        const profileResponse = await fetch(`${baseUrl}/api/auth/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ name: 'Jordan Updated', avatarUrl: null }),
        })
        assert.equal(profileResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects organization creation and delegates to the organization service', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const organizationService = {
        async list(userId) {
            assert.equal(userId, 'user-123')
            return [{ id: 'organization-1', name: 'Acme Inc.', description: null, role: 'ADMIN' }]
        },
        async create(input, userId) {
            assert.equal(input.name, 'Acme Inc.')
            assert.equal(userId, 'user-123')
            return { id: 'organization-1', name: input.name, description: null }
        },
    }
    const { server, baseUrl } = await startTestServer({ organizationService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/organizations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Acme Inc.' }),
        })
        const createdResponse = await fetch(`${baseUrl}/api/organizations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ name: 'Acme Inc.' }),
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)

        const organizationsResponse = await fetch(`${baseUrl}/api/organizations`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })
        const organizations = await organizationsResponse.json()
        assert.equal(organizationsResponse.status, 200)
        assert.equal(organizations.data[0].role, 'ADMIN')
    } finally {
        await stopTestServer(server)
    }
})

test('app protects organization invitations and delegates to the invitation service', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const invitationService = {
        async create(organizationId, input, userId) {
            assert.deepEqual([organizationId, input.email, userId], ['organization-1', 'member@example.com', 'user-123'])
            return { id: 'invitation-1', email: input.email, role: 'MEMBER', token: 'opaque-token' }
        },
    }
    const { server, baseUrl } = await startTestServer({ invitationService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/organizations/organization-1/invite`, { method: 'POST' })
        const createdResponse = await fetch(`${baseUrl}/api/organizations/organization-1/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ email: 'member@example.com', role: 'MEMBER' }),
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects invitation acceptance', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'member@example.com' })
    const invitationAcceptanceService = {
        async accept(token, userId) {
            assert.deepEqual([token, userId], ['opaque-token', 'user-123'])
            return { organizationId: 'organization-1', role: 'MEMBER', accepted: true }
        },
    }
    const { server, baseUrl } = await startTestServer({ invitationAcceptanceService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/invitations/opaque-token/accept`, { method: 'POST' })
        const acceptedResponse = await fetch(`${baseUrl}/api/invitations/opaque-token/accept`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(acceptedResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects notifications and read-state updates', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const notificationService = {
        async list(userId) {
            assert.equal(userId, 'user-123')
            return [{ id: 'notification-1', isRead: false }]
        },
        async markRead(notificationId, userId) {
            assert.deepEqual([notificationId, userId], ['notification-1', 'user-123'])
            return { id: notificationId, isRead: true }
        },
    }
    const { server, baseUrl } = await startTestServer({ notificationService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/notifications`)
        const listResponse = await fetch(`${baseUrl}/api/notifications`, { headers: { Authorization: `Bearer ${authToken}` } })
        const readResponse = await fetch(`${baseUrl}/api/notifications/notification-1/read`, { method: 'PATCH', headers: { Authorization: `Bearer ${authToken}` } })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(listResponse.status, 200)
        assert.equal(readResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects organization analytics overview', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const analyticsService = {
        async overview(organizationId, userId) {
            assert.deepEqual([organizationId, userId], ['organization-1', 'user-123'])
            return { projects: 3, tasks: 12, completedTasks: 7, overdueTasks: 2, members: 5 }
        },
    }
    const { server, baseUrl } = await startTestServer({ analyticsService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/analytics/overview?organizationId=organization-1`)
        const overviewResponse = await fetch(`${baseUrl}/api/analytics/overview?organizationId=organization-1`, { headers: { Authorization: `Bearer ${authToken}` } })
        const overview = await overviewResponse.json()

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(overviewResponse.status, 200)
        assert.equal(overview.data.completedTasks, 7)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects organization search', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const searchService = {
        async search(organizationId, query, userId) {
            assert.deepEqual([organizationId, query, userId], ['organization-1', 'api', 'user-123'])
            return { projects: [], tasks: [{ id: 'task-1', title: 'API work' }], comments: [], users: [] }
        },
    }
    const { server, baseUrl } = await startTestServer({ searchService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/search?q=api&organizationId=organization-1`)
        const searchResponse = await fetch(`${baseUrl}/api/search?q=api&organizationId=organization-1`, { headers: { Authorization: `Bearer ${authToken}` } })
        const results = await searchResponse.json()
        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(searchResponse.status, 200)
        assert.equal(results.data.tasks[0].title, 'API work')
    } finally {
        await stopTestServer(server)
    }
})

test('app protects team creation and listing by organization membership', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const teamService = {
        async create(input, userId) {
            assert.equal(input.organizationId, 'organization-1')
            assert.equal(userId, 'user-123')
            return { id: 'team-1', name: 'Product', description: null, organizationId: 'organization-1' }
        },
        async list(organizationId, userId) {
            assert.equal(organizationId, 'organization-1')
            assert.equal(userId, 'user-123')
            return [{ id: 'team-1', name: 'Product', description: null, organizationId }]
        },
        async addMember(teamId, memberUserId, userId) {
            assert.equal(teamId, 'team-1')
            assert.equal(memberUserId, 'user-456')
            assert.equal(userId, 'user-123')
            return { teamId, userId: memberUserId }
        },
        async removeMember(teamId, memberUserId, userId) {
            assert.equal(teamId, 'team-1')
            assert.equal(memberUserId, 'user-456')
            assert.equal(userId, 'user-123')
            return { teamId, userId: memberUserId }
        },
    }
    const { server, baseUrl } = await startTestServer({ teamService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/teams?organizationId=organization-1`)
        const createdResponse = await fetch(`${baseUrl}/api/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ name: 'Product', organizationId: 'organization-1' }),
        })
        const listedResponse = await fetch(`${baseUrl}/api/teams?organizationId=organization-1`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)
        assert.equal(listedResponse.status, 200)

        const addMemberResponse = await fetch(`${baseUrl}/api/teams/team-1/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ userId: 'user-456' }),
        })
        const removeMemberResponse = await fetch(`${baseUrl}/api/teams/team-1/members/user-456`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        })
        assert.equal(addMemberResponse.status, 201)
        assert.equal(removeMemberResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects project creation and listing by organization membership', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const projectService = {
        async create(input, userId) {
            assert.equal(input.organizationId, 'organization-1')
            assert.equal(userId, 'user-123')
            return { id: 'project-1', name: 'Website refresh', organizationId: 'organization-1' }
        },
        async list(organizationId, userId) {
            assert.equal(organizationId, 'organization-1')
            assert.equal(userId, 'user-123')
            return [{ id: 'project-1', name: 'Website refresh', organizationId }]
        },
        async update(projectId, input, userId) {
            assert.deepEqual([projectId, input.status, userId], ['project-1', 'ARCHIVED', 'user-123'])
            return { id: projectId, name: 'Website refresh', status: input.status, organizationId: 'organization-1' }
        },
    }
    const { server, baseUrl } = await startTestServer({ projectService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/projects?organizationId=organization-1`)
        const createdResponse = await fetch(`${baseUrl}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ name: 'Website refresh', organizationId: 'organization-1' }),
        })
        const listedResponse = await fetch(`${baseUrl}/api/projects?organizationId=organization-1`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)
        assert.equal(listedResponse.status, 200)

        const updatedResponse = await fetch(`${baseUrl}/api/projects/project-1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ status: 'ARCHIVED' }),
        })
        assert.equal(updatedResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects project member management and listing', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const projectMemberService = {
        async add(projectId, memberUserId, userId) {
            assert.deepEqual([projectId, memberUserId, userId], ['project-1', 'user-456', 'user-123'])
            return { projectId, userId: memberUserId }
        },
        async remove(projectId, memberUserId, userId) {
            assert.deepEqual([projectId, memberUserId, userId], ['project-1', 'user-456', 'user-123'])
            return { projectId, userId: memberUserId }
        },
        async list(projectId, userId) {
            assert.deepEqual([projectId, userId], ['project-1', 'user-123'])
            return [{ id: 'user-456', name: 'Alex Kim', email: 'alex@example.com' }]
        },
    }
    const { server, baseUrl } = await startTestServer({ projectMemberService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/projects/project-1/members`)
        const addResponse = await fetch(`${baseUrl}/api/projects/project-1/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ userId: 'user-456' }),
        })
        const listResponse = await fetch(`${baseUrl}/api/projects/project-1/members`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })
        const removeResponse = await fetch(`${baseUrl}/api/projects/project-1/members/user-456`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(addResponse.status, 201)
        assert.equal(listResponse.status, 200)
        assert.equal(removeResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects project task creation and listing without changing legacy tasks', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const projectTaskService = {
        async create(input, userId) {
            assert.equal(input.projectId, 'project-1')
            assert.equal(userId, 'user-123')
            return { id: 'task-1', title: input.title, projectId: input.projectId }
        },
        async list(projectId, userId) {
            assert.deepEqual([projectId, userId], ['project-1', 'user-123'])
            return [{ id: 'task-1', title: 'Ship API', projectId }]
        },
        async update(taskId, input, userId) {
            assert.deepEqual([taskId, input.status, userId], ['task-1', 'COMPLETED', 'user-123'])
            return { id: taskId, title: 'Ship API', status: input.status, projectId: 'project-1' }
        },
    }
    const { server, baseUrl } = await startTestServer({ projectTaskService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/projects/tasks?projectId=project-1`)
        const createdResponse = await fetch(`${baseUrl}/api/projects/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ title: 'Ship API', projectId: 'project-1' }),
        })
        const listedResponse = await fetch(`${baseUrl}/api/projects/tasks?projectId=project-1`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })
        const updatedResponse = await fetch(`${baseUrl}/api/projects/tasks/task-1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ status: 'COMPLETED' }),
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)
        assert.equal(listedResponse.status, 200)
        assert.equal(updatedResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})

test('app protects task comments and replies', async () => {
    const authToken = createAccessToken({ id: 'user-123', email: 'admin@example.com' })
    const commentService = {
        async create(taskId, input, userId) {
            assert.deepEqual([taskId, input.parentId || null, userId], ['task-1', null, 'user-123'])
            return { id: 'comment-1', content: input.content, taskId, parentId: null }
        },
        async list(taskId, userId) {
            assert.deepEqual([taskId, userId], ['task-1', 'user-123'])
            return [{ id: 'comment-1', content: 'Ship it!', taskId, parentId: null }]
        },
        async update(commentId, input, userId) {
            assert.deepEqual([commentId, input.content, userId], ['comment-1', 'Updated', 'user-123'])
            return { id: commentId, content: input.content, taskId: 'task-1' }
        },
        async remove(commentId, userId) {
            assert.deepEqual([commentId, userId], ['comment-1', 'user-123'])
            return { deleted: true }
        },
    }
    const { server, baseUrl } = await startTestServer({ commentService })

    try {
        const unauthorizedResponse = await fetch(`${baseUrl}/api/projects/tasks/task-1/comments`)
        const createdResponse = await fetch(`${baseUrl}/api/projects/tasks/task-1/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ content: 'Ship it!' }),
        })
        const listedResponse = await fetch(`${baseUrl}/api/projects/tasks/task-1/comments`, {
            headers: { Authorization: `Bearer ${authToken}` },
        })
        const updatedResponse = await fetch(`${baseUrl}/api/comments/comment-1`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ content: 'Updated' }),
        })
        const removedResponse = await fetch(`${baseUrl}/api/comments/comment-1`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${authToken}` },
        })

        assert.equal(unauthorizedResponse.status, 401)
        assert.equal(createdResponse.status, 201)
        assert.equal(listedResponse.status, 200)
        assert.equal(updatedResponse.status, 200)
        assert.equal(removedResponse.status, 200)
    } finally {
        await stopTestServer(server)
    }
})
