# SynergyTask API

Express/MySQL API for workforce task dispatch, shift rostering, ordered Kanban tasks, and audit history. Live URL: https://revatix-backend-assessment.onrender.com. Repository: https://github.com/Patel-Chintankumar2003/revatix-backend-assessment

## Setup

Requires Node 18+ and MySQL 8+. Copy `.env.example` to `.env`, configure either `DATABASE_URL` or `DB_*`, then run:

```sh
mysql -u USER -p DATABASE < database/schema.sql
mysql -u USER -p DATABASE < database/seed.sql
npm ci
npm start
```

`npm run dev` uses nodemon; `npm test` runs the automated checks. All database datetimes are UTC. Render uses `npm ci` and `npm start`, binds to `0.0.0.0`, and honors `PORT`. Set `DB_SSL=true` for hosted TLS; certificate verification remains enabled in production.

## Auth and endpoints

`POST /api/auth/login` accepts `{ "email", "password" }`; add its Bearer token to protected calls. `GET /api/auth/me` returns the current user. Seed credentials (assessment-only): `admin@synergytask.test` / `AdminPass123!`, `manager@synergytask.test` / `ManagerPass123!`, `employee1@synergytask.test` / `EmployeePass123!`.

Admins/managers manage master tasks (`POST/GET /api/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `PATCH /api/tasks/:id/move`), subtasks (`POST/GET /api/tasks/:taskId/subtasks`, `GET/PATCH/DELETE /api/subtasks/:id`, `PATCH /api/subtasks/:id/move`), assignments, and shifts (`POST/GET /api/shifts`, `GET/PATCH/DELETE /api/shifts/:id`). Employees can read `/api/employees/:employeeId/shifts` and `/api/employees/:employeeId/subtasks`, and update their assigned subtask status. Managers/admins can read paginated `/api/audit-logs`.

Tasks filter with `page`, `limit`, `status`, `priority`; audit logs with `page`, `limit`, `entityType`, `entityId`, `actor`. Use `/health` for liveness and `/ready` for database readiness.

```sh
curl -X POST "$URL/api/shifts" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"employeeId":3,"startTime":"2026-10-12T09:00:00Z","endTime":"2026-10-12T17:00:00Z"}'
```

## Integrity

Shift writes transact, lock the employee with `FOR UPDATE`, and use `start_time < newEnd AND end_time > newStart`. Thus adjacent shifts work and overlaps return `409 SHIFT_OVERLAP`. Moves lock, remove, insert, and reindex contiguous zero-based positions within a transaction. Every state mutation writes an audit record in the same transaction. Assignment requests are transactional and duplicate employee IDs are idempotent. Real MySQL concurrency tests need a separate test database; default tests are isolated algorithm tests.

Source layout: `src/config` (pool), `middleware` (JWT/errors), `routes`, `services`, `database` (schema/seeds), and `tests`. Never commit `.env` secrets.
