# WorkFlowX Architecture

## Architectural intent

WorkFlowX is a multi-tenant React application backed by a REST API. The MVP keeps the current small, understandable implementation while introducing boundaries that can grow into Express, Prisma, Socket.IO, Redis, and background workers without forcing a frontend rewrite.

## Current state

```text
React + Vite
    |
    | Vite /api proxy
    v
Node.js HTTP server
    |
    v
JSON task repository (backend/src/data/tasks.json)
```

The current API exposes `GET /health`, `GET /api/tasks`, and `POST /api/tasks`. It is a useful vertical slice, but it is not yet the target production architecture: there is no authentication, tenant boundary, database, or server-side authorization.

## Target runtime architecture

```text
Browser
  | HTTPS / WebSocket
  v
React + Vite application
  | REST client and realtime client
  v
Express API -------------------- Socket.IO gateway
  | middleware                         |
  | auth, validation, rate limit       | project/user rooms
  v                                    v
Controllers -> Services -> Repositories -> Prisma -> PostgreSQL
                         |
                         +-> domain events -> notifications/activity

Express/worker -> Redis -> BullMQ workers -> email, reminders, summaries
                                      |
                                      +-> object storage adapter (later: S3)
```

## Backend request flow

```text
Request
  -> route
  -> authenticate access token
  -> resolve organization membership
  -> authorize capability
  -> validate params/query/body
  -> controller
  -> service transaction/use case
  -> repository
  -> Prisma/PostgreSQL
  -> activity, notification, and socket event as needed
  -> consistent JSON response
```

Controllers should translate HTTP input/output only. Business rules belong in services. Repositories own Prisma queries. This keeps tenant checks and authorization close to the use case rather than scattering them across route handlers.

## Suggested repository structure

```text
backend/src/
  app.js                 # Express app assembly
  server.js              # HTTP server and Socket.IO startup
  config/                # environment and dependency configuration
  controllers/
  routes/
  services/
  repositories/
  middleware/            # auth, RBAC, validation, errors, rate limits
  validators/
  sockets/
  jobs/
  utils/

frontend/src/
  components/
  pages/
  layouts/
  hooks/
  services/              # REST and Socket.IO clients
  store/                 # only client/session state that needs global access
  types/
  utils/
  routes/

prisma/
  schema.prisma
  migrations/

docs/
  requirements.md
  architecture.md
  database-design.md
```

## Frontend boundaries

- Route/layout components own page composition and access guards.
- Feature components own task, project, team, and comment interactions.
- `services/` owns HTTP and realtime calls; components do not build raw URLs throughout the UI.
- Server state should use a query/cache layer when introduced. Local UI state remains local.
- The current dashboard can continue using `/api/tasks` while each feature is migrated independently.

## Security model

- Access tokens are short-lived; refresh tokens are rotated and revocable.
- Passwords use a memory-hard or adaptive password hash.
- Organization membership is loaded from the database for the requested organization.
- Services scope every query by the authenticated organization and verify resource membership before mutation.
- Validation, rate limiting, CORS, secure headers, and centralized error handling are API middleware concerns.
- Tokens, passwords, and sensitive personal data are excluded from logs.

## Realtime model

Socket.IO rooms should be scoped to authorization boundaries, for example `organization:{id}`, `project:{id}`, and `user:{id}`. A client may join a room only after the server verifies access. Database mutations complete first; then the service publishes a domain event so connected clients receive the committed state. Realtime delivery is an optimization, not the source of truth.

## Background jobs

Redis is used for queue transport and transient coordination, not primary business data. Services enqueue idempotent jobs for email, deadline reminders, summaries, and invitation cleanup. Workers must tolerate retries and avoid sending duplicate notifications through stable job keys or recorded delivery state.

## API conventions

- Prefix application routes with `/api`.
- Use resource-oriented REST paths and HTTP status codes.
- Return `{ data, meta }` for collections and `{ data }` for single resources.
- Return one documented error envelope from centralized error middleware.
- Use ISO-8601 timestamps and explicit enum values.
- Paginate all potentially large collections.
- Keep the initial task response compatible with the current frontend during migration.

## Delivery checkpoints

1. Extract the current task file access behind a repository-like module and add tests.
2. Introduce Prisma/PostgreSQL with the model in `database-design.md` and a migration strategy.
3. Add Express routing, authentication, organization scoping, and RBAC.
4. Move task CRUD and comments behind services while preserving the dashboard contract.
5. Add the remaining feature modules, then realtime, jobs, storage, and operational tooling.
