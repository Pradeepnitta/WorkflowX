# WorkFlowX API

## Base URL

The development API runs at `http://localhost:3001`. The frontend reaches it through the Vite `/api` proxy.

## Current endpoints

### Register

```http
POST /api/auth/register
Content-Type: application/json
```

Body:

```json
{
  "name": "Jordan Davis",
  "email": "jordan@example.com",
  "password": "correct horse"
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json
```

The register and login responses return `{ "data": { "user": {}, "accessToken": "..." } }`.

### Refresh access token

```http
POST /api/auth/refresh
Content-Type: application/json
```

Body:

```json
{
  "refreshToken": "opaque-refresh-token"
}
```

Refresh tokens are rotated after use; the previous token is revoked.

### Logout

```http
POST /api/auth/logout
Content-Type: application/json
```

Body:

```json
{
  "refreshToken": "opaque-refresh-token"
}
```

Logout revokes the active refresh token and is safe to repeat.

### Current authenticated user

```http
GET /api/auth/me
Authorization: Bearer <access-token>
```

Response:

```json
{
  "data": {
    "id": "user-123",
    "email": "admin@example.com"
  }
}
```

### Update profile

```http
PATCH /api/auth/me
Authorization: Bearer <access-token>
Content-Type: application/json
```

Accepted fields are `name` and `avatarUrl`; either may be updated independently. Password hashes are never returned.

### Create organization

```http
POST /api/organizations
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Acme Inc.",
  "description": "Team workspace"
}
```

The authenticated user is added as the organization administrator.

### List my organizations

```http
GET /api/organizations
Authorization: Bearer <access-token>
```

The response contains only organizations where the authenticated user is a member, including their organization role.

### Invite organization member

```http
POST /api/organizations/organization-id/invite
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body: `{ "email": "member@example.com", "role": "MEMBER" }`

Only organization admins can create invitations. The response includes a one-time opaque token for the future email delivery flow; only its hash is persisted.

### Accept invitation

```http
POST /api/invitations/invitation-token/accept
Authorization: Bearer <access-token>
```

The authenticated user’s email must match the invitation. Acceptance creates the organization membership and marks the invitation accepted.

### Notifications

```http
GET /api/notifications
PATCH /api/notifications/notification-id/read
Authorization: Bearer <access-token>
```

Notifications are scoped to the authenticated user. Read updates are idempotent for that user.

### Analytics overview

```http
GET /api/analytics/overview?organizationId=organization-id
Authorization: Bearer <access-token>
```

Returns organization-scoped project, task, completed-task, overdue-task, and member totals.

### Organization search

```http
GET /api/search?q=api&organizationId=organization-id
Authorization: Bearer <access-token>
```

Searches projects, tasks, comments, and organization users. Queries must contain at least two characters.

### Create team

```http
POST /api/teams
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Product",
  "description": "Core product team",
  "organizationId": "organization-id"
}
```

Only organization admins and managers can create teams.

### List teams

```http
GET /api/teams?organizationId=organization-id
Authorization: Bearer <access-token>
```

Only members of the requested organization can list its teams.

### Create project

```http
POST /api/projects
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Website refresh",
  "organizationId": "organization-id",
  "status": "PLANNING",
  "visibility": "ORGANIZATION",
  "priority": "MEDIUM",
  "dueDate": "2026-10-01"
}
```

Only organization admins and managers can create projects.

### List projects

```http
GET /api/projects?organizationId=organization-id
Authorization: Bearer <access-token>
```

Only members of the requested organization can list its projects.

### Update project

```http
PATCH /api/projects/project-id
Authorization: Bearer <access-token>
Content-Type: application/json
```

Accepted fields include `name`, `description`, `status`, `visibility`, `priority`, and `dueDate`. Use status `ARCHIVED` for soft archival. Only organization admins and managers can update projects.

### Create project task

```http
POST /api/projects/tasks
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body:

```json
{
  "title": "Ship API",
  "projectId": "project-id",
  "priority": "MEDIUM",
  "status": "TODO",
  "dueDate": "2026-10-01"
}
```

The task creator must have access to the project. An assignee must be a project member.

### List project tasks

```http
GET /api/projects/tasks?projectId=project-id
Authorization: Bearer <access-token>
```

The existing `/api/tasks` endpoint remains the legacy JSON-backed dashboard API during migration.

### Update project task

```http
PATCH /api/projects/tasks/task-id
Authorization: Bearer <access-token>
Content-Type: application/json
```

Accepted fields include `title`, `description`, `status`, `priority`, `assigneeId`, and `dueDate`. Assignees must be project members.

### Task comments

```http
GET /api/projects/tasks/task-id/comments
POST /api/projects/tasks/task-id/comments
Authorization: Bearer <access-token>
Content-Type: application/json
```

Create body:

```json
{
  "content": "Ship it!",
  "parentId": "optional-parent-comment-id"
}
```

Replies use `parentId` and must belong to the same task.

### Edit or delete a comment

```http
PATCH /api/comments/comment-id
DELETE /api/comments/comment-id
Authorization: Bearer <access-token>
```

Edit body: `{ "content": "Updated comment" }`. Only the comment author can edit or delete it.

### Project members

```http
GET /api/projects/project-id/members
POST /api/projects/project-id/members
DELETE /api/projects/project-id/members/user-id
Authorization: Bearer <access-token>
```

The `POST` body is `{ "userId": "user-id" }`. Listing requires project membership; adding and removing members requires organization admin or manager permissions.

### Add team member

```http
POST /api/teams/team-id/members
Authorization: Bearer <access-token>
Content-Type: application/json
```

Body: `{ "userId": "user-id" }`

Only organization admins and managers can manage team membership, and the target user must belong to the organization.

### Remove team member

```http
DELETE /api/teams/team-id/members/user-id
Authorization: Bearer <access-token>
```

### Health

```http
GET /health
GET /api/health
```

Response:

```json
{
  "status": "healthy",
  "service": "workflowx-api"
}
```

### List tasks

```http
GET /api/tasks
```

Optional query parameters:

```text
q=permissions
status=Todo|In progress|Review|Done
priority=Low|Medium|High
assignee=JD
page=1
limit=20
```

`q` searches task titles, projects, and assignees. All filters are case-insensitive. `limit` is capped at 100.

Response:

```json
{
  "data": [
    {
      "id": 1,
      "title": "Audit API permissions",
      "project": "Platform security",
      "status": "Todo",
      "priority": "High",
      "assignee": "AK",
      "due": "Tomorrow"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Create a task

```http
POST /api/tasks
Content-Type: application/json
```

Body:

```json
{
  "title": "Connect dashboard to API",
  "priority": "Medium"
}
```

`priority` accepts `Low`, `Medium`, or `High`. The title is required.

## Error response

Current errors use a simple shape:

```json
{
  "error": "Task title is required"
}
```

## Planned API

The target REST surface is documented in [requirements.md](requirements.md). Authentication, organization-scoped authorization, projects, teams, comments, pagination, and filtering will be added incrementally while preserving the current task response contract during migration.
