# WorkFlowX API

The API uses PostgreSQL for organization-scoped projects, teams, tasks, reviews, and analytics.

## Setup

Apply the additive Manager workflow migration once before starting the API:

```bash
npm run migrate:manager-workflows
```

Configure the PostgreSQL connection using the environment variables expected by `src/config/db.js`, then run:

```bash
npm run dev
```

The API listens on `http://localhost:3001`.
Set `AUTH_ACCESS_TOKEN_SECRET` before starting the API. Configure `ADMIN_SECRET_KEY` (or `ADMIN_KEY`) to enable the protected global-Admin signup and signin flow.

Run the global Admin migration after deployment:

```bash
npm run migrate:global-admin
```

Existing organization Admin memberships remain organization-scoped. Only accounts registered through the protected global-Admin bootstrap flow receive system-wide Admin access.

## Main endpoints

- `GET /health`
- `/api/projects` for organization-scoped projects and project task summaries
- `/api/teams` for organization-scoped teams and memberships
- `/api/projects/tasks` for project tasks, comments, and review workflows
- `/api/tasks` for authenticated users' personal legacy tasks; assignment and cross-user access are restricted
- `/api/analytics/overview` for role-scoped dashboard and analytics data
- `GET /api/admin/overview` for global Admin metrics
- `GET /api/admin/users` for global user search and filtering
- `PATCH /api/admin/users/:userId` and `DELETE /api/admin/users/:userId` for account updates and deactivation
- `GET /api/admin/audit-logs` for immutable administrative audit history

Protected endpoints require a valid access token. Use `/api/projects/tasks` for organization-managed tasks and Manager assignment workflows. Apply the Manager workflow migration before deploying code that uses project team assignments, task progress, completion timestamps, or task reviews.

Assigned tasks with deadlines generate a reminder 24 hours before the due timestamp and an overdue notification when the due timestamp passes. Notifications are sent to the assignee and task creator. BullMQ/Redis provides persistent delayed delivery; when Redis is unavailable, delayed notifications use in-process timers and are lost if the API process restarts.
