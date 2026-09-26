# WorkFlowX

WorkFlowX is a project and task collaboration workspace.

## Current state

The repository currently contains a working React/Vite dashboard and a small Node.js API. Tasks are persisted in `backend/src/data/tasks.json` while the PostgreSQL/Prisma foundation is being introduced.

## Run locally

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` requests to `http://localhost:3001`.

## Database setup

Docker is required for the local PostgreSQL service:

```bash
docker compose up -d postgres
cd backend
npm run prisma:migrate -- --name init
npm run prisma:generate
npm run prisma:seed
```

Copy `.env.example` to `.env` and set both `DATABASE_URL` and a long random `AUTH_ACCESS_TOKEN_SECRET` when needed.

## Project map

- `frontend/`: React/Vite user interface.
- `backend/`: Node.js API and repository layer.
- `prisma/`: PostgreSQL schema and migrations.
- `docs/`: requirements, architecture, database design, and API notes.
- `docker-compose.yml`: local PostgreSQL service.
