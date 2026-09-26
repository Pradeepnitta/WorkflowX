# WorkFlowX API

Small persistent API slice for the dashboard. Tasks are stored in `src/data/tasks.json` until the PostgreSQL/Prisma phase.

## Run

```bash
npm run dev
```

The API listens on `http://localhost:3001`.

## Endpoints

- `GET /health`
- `GET /api/tasks`
- `POST /api/tasks` with `{ "title": "...", "priority": "Low|Medium|High" }`
