# TaskPilot

TaskPilot is a full-stack project and task management workspace with JWT authentication and admin/member roles. It provides projects, a Kanban task board, search, filters, pagination, comments, labels, activity history, and in-app notifications.

## Features

- Admin/member roles with protected workspace administration
- Projects with descriptions, colors, due dates, and task progress
- Tasks with assignees, priorities, statuses, due dates, labels, search, filters, sorting, and pagination
- Kanban views grouped by To Do, In Progress, and Done
- Task comments and activity history
- In-app assignment, comment, due-soon, and overdue notifications

## Tech stack

The frontend is vanilla HTML, CSS, and JavaScript. The backend uses Node.js 20–24, Express, PostgreSQL, JWT, bcryptjs, Helmet, CORS, and Supertest for integration tests.

## Local setup

Use Node.js >=20 and <25. Create a throwaway Neon/Postgres development branch or a local database; never use a production database for local development or tests.

```bash
npm install
# create .env with the variables below
npm start
```

Open `http://localhost:3000`.

### Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string for the running app. |
| `JWT_SECRET` | Yes | — | JWT signing secret; at least 32 characters. |
| `NODE_ENV` | No | `development` | Use `production` for production behavior and disable demo seeding. |
| `PORT` | No | `3000` | HTTP port. |
| `DB_POOL_MAX` | No | `5` | Maximum PostgreSQL pool size. |
| `DB_REJECT_UNAUTHORIZED` | No | `true` | PostgreSQL TLS certificate verification in production. |
| `FRONTEND_URL` | No | empty | Comma-separated allowed production CORS origin(s). |
| `ALLOW_REGISTRATION` | No | `true` | Set to `false` to disable public registration. |
| `TEST_DATABASE_URL` | Tests only | — | Disposable test database URL. It must be localhost or have `test` in the database name. |

## API reference

All endpoints except health and authentication require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/auth/me`, `/api/auth/register` | Current user and registration |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/change-password` | Change password |
| GET/POST/PUT/DELETE | `/api/projects`, `/api/projects/:id` | Project access and administration |
| GET/POST/PUT/PATCH/DELETE | `/api/tasks`, `/api/tasks/:id`, `/api/tasks/:id/status` | Task CRUD and status updates |
| GET/POST/PUT/DELETE | `/api/tasks/:taskId/comments`, `/api/comments/:id` | Task comments |
| GET | `/api/members`, `/api/activities`, `/api/labels` | Workspace data |
| GET | `/api/notifications?unread=true&page=1&limit=50` | Own notifications, newest first |
| GET | `/api/notifications/unread-count` | Cheap unread count |
| PATCH | `/api/notifications/:id/read` | Mark one own notification read |
| POST | `/api/notifications/read-all` | Mark all own notifications read |
| GET | `/api/health` | Public database health check |

## Testing

Tests use `node:test` and Supertest. They TRUNCATE tables, so `TEST_DATABASE_URL` must point to a disposable database on localhost or to a database whose name contains `test`; never point it at production. Run `npm test` only with that variable configured. CI uses a PostgreSQL service container.

## Deployment on Render

Use the Render Blueprint, which reads `render.yaml`. The service auto-deploys on pushes to `main`; the free instance sleeps when idle. Do not edit `render.yaml` casually because it controls the deployment contract and generated environment settings.

## Security notes

TaskPilot uses Helmet with a Content Security Policy, parameterized SQL, role checks, and escaped UI output. JWTs are stored in `localStorage` and expire after seven days; this is a known limitation. Keep secrets out of source control and use a separate disposable database for tests.

## Demo accounts (development only)

Demo users are created only when `NODE_ENV` is not `production` and the `users` table is empty. They are intended only for development; do not rely on them in production.
