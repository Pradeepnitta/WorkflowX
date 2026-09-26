# WorkFlowX Frontend

The first WorkFlowX slice is a responsive workspace dashboard built with React and Vite. It currently uses local state so the product surface can be exercised before the API and persistence layers are introduced.

## Run locally

```bash
# terminal 1
cd ../backend
npm run dev

# terminal 2
npm install
npm run dev
```

## Current slice

- Workspace navigation and active-view state
- Project summary metrics
- Filterable task board with Todo, In progress, Review, and Done columns
- New-task modal with local task creation
- Recent team activity panel
- Responsive desktop and mobile layouts
- Persistent task loading and creation through the backend API

## Planned integration boundary

The dashboard consumes `GET /api/tasks` and `POST /api/tasks` through the Vite development proxy. The API currently persists tasks to `backend/src/data/tasks.json`; the next backend slice can replace that repository with PostgreSQL and Prisma without changing the page structure.
