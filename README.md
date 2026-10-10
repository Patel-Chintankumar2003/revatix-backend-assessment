# SynergyTask API

**HR Workforce & Task Dispatch System — Backend Technical Assessment**

SynergyTask is a REST API for managing organizational tasks, employee subtasks, workforce shifts, Kanban-style status/position ordering, and auditable changes. Built with **Node.js, Express.js, and MySQL**.

**Live API:** https://revatix-backend-assessment.onrender.com  
**Source code:** https://github.com/Patel-Chintankumar2003/revatix-backend-assessment

> This is a backend-only assessment project. It has no frontend dashboard. Use Postman, curl, or another HTTP client to exercise the API. The hosted service may take a short time to wake up on Render's free tier.

## 1. Features

- **Hierarchical work management:** Managers/admins create master tasks with priority and deadline, then split them into subtasks.
- **Multi-employee assignments:** A subtask can be assigned to more than one employee.
- **Shift rostering:** Create, update, list, and delete employee shifts with backend overlap validation.
- **Ordered workflow:** Move tasks and subtasks across statuses and positions; ordering is maintained in MySQL transactions.
- **Role-based access:** JWT authentication and permissions for administrators, managers, and employees.
- **Audit history:** Mutating operations record who changed what and when.
- **Operational endpoints:** `/health` for server liveness and `/ready` for database readiness.

## 2. Technology stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| HTTP framework | Express 5 |
| Database | MySQL 8+ with `mysql2` |
| Authentication | JSON Web Tokens (`jsonwebtoken`) and password hashes (`bcryptjs`) |
| Validation | Zod |
| Security middleware | Helmet and CORS |
| Tests | Node.js built-in test runner |
| API hosting | Render |
| Hosted database | Railway MySQL |

## 3. System overview

```text
Postman / curl / API consumer
              |
              v
      Render (Express API)
              |
     JWT + role middleware
              |
   Routes / transaction logic
              |
              v
       Railway MySQL
   users | tasks | subtasks
   subtask_assignments | shifts | audit_logs
```

The API runs on Render and connects to the hosted MySQL instance using environment variables. **No local XAMPP server is required to use the deployed API.**

## 4. Database design

The SQL definitions are in `database/schema.sql`; demo records are in `database/seed.sql`.

| Table | Purpose |
|---|---|
| `users` | Accounts, password hashes, and roles |
| `tasks` | Master tasks, priorities, deadlines, statuses, and ordering |
| `subtasks` | Work items linked to master tasks, with their own status/position |
| `subtask_assignments` | Many-to-many mapping of subtasks to employees |
| `shifts` | Employee start/end times and creator |
| `audit_logs` | Historical records of entity mutations |

**Relationships:** A task has many subtasks. A subtask can have many employee assignees, and an employee can have many assigned subtasks. A user can have multiple shifts. Audit entries reference the actor and affected entity.

## 5. Local installation

### Prerequisites

- Node.js 18 or later and npm
- MySQL 8+ (or a compatible hosted MySQL database)
- A terminal and an HTTP client such as Postman

### Clone and install

```bash
git clone https://github.com/Patel-Chintankumar2003/revatix-backend-assessment.git
cd revatix-backend-assessment
npm ci
```

### Configure environment

Copy `.env.example` to `.env` and supply your own credentials. For Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Example local `.env`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=synergytask
DB_SSL=false
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=8h
```

The project supports `DATABASE_URL` **or** the individual `DB_*` fields. Use values that match your environment. Do not commit `.env` or publish live credentials. `.env.example` contains variable names and non-secret examples only.

### Create database and import SQL

Create an empty MySQL database, for example `synergytask`. Ensure the scripts target the selected database, then run:

```bash
mysql -u USER -p DATABASE < database/schema.sql
mysql -u USER -p DATABASE < database/seed.sql
```

Alternatively, open the scripts in MySQL Workbench and execute **schema first, seed second**. For Railway, select the hosted database (often named `railway`) rather than your local database. Confirm that all six tables exist:

```sql
SHOW TABLES;
SELECT COUNT(*) AS user_count FROM users;
```

### Run

```bash
npm start
```

For development with automatic restarts:

```bash
npm run dev
```

Default local base URL: `http://localhost:3000` (unless `PORT` is changed).

## 6. Demo accounts

The seed script provides assessment-only accounts:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@synergytask.test` | `AdminPass123!` |
| Manager | `manager@synergytask.test` | `ManagerPass123!` |
| Employee | `employee1@synergytask.test` | `EmployeePass123!` |

Another employee account is seeded for multi-user scheduling and assignment tests. **These credentials are for demonstration only; never reuse them for real users.**

## 7. Authentication

Log in to obtain a JWT:

```http
POST /api/auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@synergytask.test",
  "password": "AdminPass123!"
}
```

For protected endpoints, send the token returned by login:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

`GET /api/auth/me` returns information about the authenticated user.

### Roles

- **ADMIN / MANAGER:** Manage tasks, subtasks, assignments, and shifts; view audit history.
- **EMPLOYEE:** Read their relevant shifts/subtasks and update the status of assigned subtasks. Unauthorized operations are rejected.

## 8. API reference

All paths below are relative to the base URL. Unless otherwise indicated, business endpoints require a Bearer token. JSON request bodies should include `Content-Type: application/json`.

### Health and authentication

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Server liveness |
| GET | `/ready` | Database readiness |
| POST | `/api/auth/login` | Obtain access token |
| GET | `/api/auth/me` | Current authenticated user |

### Master tasks

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tasks` | Create master task |
| GET | `/api/tasks` | List tasks; supports pagination/filtering |
| GET | `/api/tasks/:id` | Task details |
| PATCH | `/api/tasks/:id` | Update task fields |
| PATCH | `/api/tasks/:id/move` | Move task to status/position |
| DELETE | `/api/tasks/:id` | Delete task |

List filters: `page`, `limit`, `status`, `priority`.

### Subtasks and assignments

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tasks/:taskId/subtasks` | Create subtask |
| GET | `/api/tasks/:taskId/subtasks` | List subtasks for a task |
| GET | `/api/subtasks/:id` | Subtask details |
| PATCH | `/api/subtasks/:id` | Update subtask; assigned employees may update status |
| PATCH | `/api/subtasks/:id/move` | Reorder or move subtask |
| DELETE | `/api/subtasks/:id` | Delete subtask |

Subtask assignment operations are available through the subtask routes; consult `src/routes/subtasks.js` for the exact request/response shape before calling them.

### Shifts and employee views

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/shifts` | Schedule employee shift |
| GET | `/api/shifts` | List shifts |
| GET | `/api/shifts/:id` | Shift details |
| PATCH | `/api/shifts/:id` | Update shift, with conflict check |
| DELETE | `/api/shifts/:id` | Delete shift |
| GET | `/api/employees/:employeeId/shifts` | Employee's shifts |
| GET | `/api/employees/:employeeId/subtasks` | Employee's assigned subtasks |

### Audit history

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/audit-logs` | Paginated audit records for admin/manager |

Audit filters: `page`, `limit`, `entityType`, `entityId`, `actor`.

## 9. Request examples

Set `BASE_URL` to either the deployed URL or your local API. Replace `TOKEN` with the value returned by login.

### Check database connectivity

```bash
curl https://revatix-backend-assessment.onrender.com/ready
```

A healthy response resembles:

```json
{
  "success": true,
  "message": "Database is ready"
}
```

### Create an employee shift

```bash
curl -X POST "$BASE_URL/api/shifts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employeeId":3,"startTime":"2026-10-12T09:00:00Z","endTime":"2026-10-12T17:00:00Z"}'
```

### Verify shift overlap rejection

Create another shift for the **same employee** with overlapping times, e.g. `12:00Z`–`18:00Z` on the same date. The API should reject it with **HTTP 409** and code **`SHIFT_OVERLAP`**. A shift starting exactly when the previous one ends should be allowed.

### Read audit history

```bash
curl "$BASE_URL/api/audit-logs?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

## 10. Data integrity and concurrency

### Shift overlap prevention

For an existing shift and proposed interval, overlap is detected using:

```sql
existing.start_time < proposed.end_time
AND existing.end_time > proposed.start_time
```

This treats intervals as **half-open**: `[start, end)`. Two adjacent shifts are permitted; overlapping shifts are rejected. Shift writes use MySQL transactions and employee-row `SELECT ... FOR UPDATE` locking to coordinate competing requests. The API returns `409 SHIFT_OVERLAP` for a detected conflict.

### Task/subtask ordering

Kanban items have a status and a zero-based position. Move operations execute transactionally, update the relevant status/position, and reindex the affected ordered set to avoid gaps or duplicate ranks. Use the dedicated `.../move` endpoints for sequence changes.

### Audit trail

State-changing operations write an audit entry alongside the data mutation in the same transaction. This makes the business change and corresponding history atomic: if the transaction rolls back, its audit entry rolls back as well.

## 11. Testing and validation

Run the automated tests:

```bash
npm test
```

The repository includes isolated tests for shift-overlap and ordering logic. **These are not a substitute for end-to-end or concurrent MySQL integration tests.** A dedicated test database is needed to validate transaction behavior under simultaneous requests.

Recommended manual acceptance checks:

1. Log in as admin or manager and access a protected route.
2. Confirm an unauthenticated request is rejected.
3. Create a task with deadline and priority.
4. Create subtasks and assign multiple employees.
5. Move a task/subtask and inspect its position and status.
6. Create a shift, then attempt an overlapping shift for the same employee; expect HTTP 409.
7. Create an adjacent non-overlapping shift; expect success.
8. Update a subtask as its assigned employee; verify permissions for unrelated employees.
9. Query audit logs after mutations and confirm records are present.
10. Verify `/ready` on the hosted service independently of local MySQL.

## 12. Deployment

### Backend — Render

- Runtime: Node.js
- Branch: `main`
- Build command: `npm ci`
- Start command: `npm start`
- Host binding: `0.0.0.0`
- Port: use Render's `PORT` environment variable

### Database — Railway MySQL

1. Provision a MySQL service.
2. Enable the external TCP connection if Render is hosting the API.
3. Import `database/schema.sql`, then `database/seed.sql`.
4. Copy the **public** hostname and port into Render's database environment variables.
5. Configure `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `JWT_SECRET` in Render's Environment settings.
6. Deploy the backend and check `/ready`.

Use TLS for external database connections where supported. `DB_SSL` controls whether the application's connection configuration requests TLS; verify the provider's requirements and certificate settings. Never commit the Railway database password or connection URL.

## 13. Project layout

```text
revatix-backend-assessment/
├── database/
│   ├── schema.sql
│   └── seed.sql
├── src/
│   ├── app.js
│   ├── config/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   └── utils/
├── tests/
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## 14. Notes and limitations

- The application exposes a **REST API**, not a live push/WebSocket event stream; "real-time" status synchronization in this implementation refers to persisted status updates available to subsequent API requests.
- All database timestamps are handled as UTC; supply ISO 8601 timestamps with a timezone (`Z` recommended).
- Seed users and passwords are for assessment demonstration only.
- The hosted Render free service may sleep while idle; the first request can take longer.
- Real database concurrency/integration coverage should be added before production use.
- `/ready` proves database connectivity; it does **not** prove every business workflow is correct.

---

**Assessment:** Revatix — SynergyTask (HR Workforce & Task Dispatch System)  
**Developer:** Chintan Patel
