# WorkFlowX Requirements

## Product goal

WorkFlowX is a multi-tenant workspace for organizing projects, tasks, team collaboration, and progress reporting. The first release prioritizes a dependable task workflow over breadth: authentication, organization membership, teams, projects, tasks, and comments.

## Current implementation

The repository currently contains:

- A React 19/Vite dashboard in `frontend/`.
- A small Node.js HTTP API in `backend/`.
- `GET /api/tasks` and `POST /api/tasks` backed by `backend/src/data/tasks.json`.
- A Vite development proxy from `/api` to `localhost:3001`.

The requirements below describe the target product. Features marked as later phases must not block the MVP.

## MVP functional requirements

### Authentication and identity

- A user can register, log in, log out, refresh an access token, and view their profile.
- Passwords are stored as one-way hashes and are never returned by the API.
- Authenticated requests carry a short-lived access token. Refresh tokens are revocable.
- A user can update their profile and avatar URL. Password reset and password change follow the same security boundary.

### Organizations and membership

- A user can create an organization and becomes its administrator.
- Organization administrators can invite and remove members and assign organization roles.
- Every organization-owned resource is scoped by organization membership.
- Invitations have a unique token, an expiry, a status, and one assigned role.

### Teams

- Authorized users can create, update, and delete teams within an organization.
- Authorized users can add and remove organization members from teams.
- Members can view the teams they belong to and their team members.

### Projects

- Admins and managers can create, update, archive, and delete projects.
- Projects have a status, visibility, dates, creator, and organization.
- Authorized users can add and remove project members.
- Project members can view projects permitted by their organization and project membership.

### Tasks

- Authorized users can create, update, and delete tasks within a project.
- A task can be assigned to a project member, given a status, priority, due date, and labels.
- Members can update work on tasks they are permitted to access; viewers have read-only access.
- Task lists support pagination and filtering by project, status, priority, assignee, and due date.

### Comments

- Permitted users can add comments to tasks.
- A user can edit or delete their own comments; administrators may moderate comments according to the authorization policy.
- Comments support replies through a self-referencing parent relationship.

## Roles and authorization

Roles are scoped to an organization membership:

| Capability | Admin | Manager | Member | Viewer |
| --- | --- | --- | --- | --- |
| Manage organization and members | Yes | No | No | No |
| Manage teams | Yes | Yes | No | No |
| Create and manage projects | Yes | Yes | No | No |
| Create and assign tasks | Yes | Yes | Create/update permitted work | No |
| Comment and collaborate | Yes | Yes | Yes | No |
| View projects and tasks | Yes | Yes | Yes | Yes |
| View analytics | Yes | Yes | Limited | Yes |

Authorization is enforced on the server for every organization-scoped resource. The client may hide unavailable actions, but it is not a security boundary.

## Later-phase requirements

- Real-time task, comment, presence, chat, and notification events with Socket.IO.
- In-app notifications for assignment, changes, mentions, invitations, comments, and deadlines.
- Search across users, projects, tasks, and comments.
- Dashboard analytics: project totals, task status/priority, overdue work, completion trends, and team productivity.
- Attachment upload, download, and deletion, initially through a storage abstraction that can target S3.
- BullMQ/Redis jobs for email, deadline reminders, weekly summaries, and invitation cleanup.
- Operational health checks, structured activity logs, rate limits, auditability, automated tests, Docker, CI, and deployment monitoring.

## API direction

The target API is REST under `/api` and uses JSON responses. Collection endpoints support `page` and `limit`; task and project collections also support documented filters. Errors use a consistent shape such as `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }`.

Initial endpoint groups:

- `/api/auth`: register, login, logout, refresh, password reset, and current user.
- `/api/users`: organization-scoped member listing, search, profile update, and removal.
- `/api/organizations`: organization CRUD, member listing, and invitations.
- `/api/teams`: team CRUD and membership.
- `/api/projects`: project CRUD and membership.
- `/api/tasks`: task CRUD, filtering, pagination, and comments.
- `/api/comments`: comment update and deletion.
- `/api/health`: service and dependency health.

## Non-functional requirements

- Tenant isolation: a user must never read or mutate another organization’s data.
- Validation: reject malformed payloads and invalid enum values at the API boundary.
- Performance: indexed list filters and bounded pagination; no unbounded collection response.
- Reliability: database writes are transactional when multiple records change together.
- Privacy: minimize returned personal data, hash credentials, and avoid logging tokens or passwords.
- Accessibility: keyboard-operable controls, visible focus, semantic labels, and useful empty/error/loading states.
- Compatibility: preserve the current dashboard’s task API contract while the repository migrates from JSON storage to PostgreSQL.

## Delivery sequence

1. Keep the current dashboard working while introducing PostgreSQL and Prisma.
2. Add authentication, organizations, membership, roles, teams, projects, tasks, and comments.
3. Add pagination, filtering, search, and server-side RBAC.
4. Add real-time events and notifications.
5. Add Redis/BullMQ, file storage, analytics, testing, Docker, CI, and deployment hardening.
