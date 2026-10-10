const router = require("express").Router();
const { z } = require("zod");
const { pool, transaction } = require("../config/database");
const { auth, roles } = require("../middleware/auth");
const { AppError, ok } = require("../utils/http");
const { audit } = require("../services/audit");
const { move } = require("../services/reorder");
const { formatMySqlUtc } = require("../utils/datetime");
const statuses = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"],
  priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const task = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  deadline: z.string().datetime(),
  priority: z.enum(priorities).default("MEDIUM"),
  status: z.enum(statuses).default("TODO"),
});
const moveBody = z.object({
  status: z.enum(statuses),
  position: z.number().int().min(0),
});
router.use(auth);
router.post("/", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const b = task.parse(req.body);
    const out = await transaction(async (c) => {
      const [[x]] = await c.execute(
        "SELECT COALESCE(MAX(position)+1,0) p FROM tasks WHERE status=? FOR UPDATE",
        [b.status],
      );
      const [r] = await c.execute(
        "INSERT INTO tasks(title,description,deadline,priority,status,position,created_by) VALUES(?,?,?,?,?,?,?)",
        [
          b.title,
          b.description || null,
          formatMySqlUtc(b.deadline),
          b.priority,
          b.status,
          x.p,
          req.user.id,
        ],
      );
      const v = { id: r.insertId, ...b, position: x.p };
      await audit(c, req.user.id, "task", r.insertId, "CREATED", null, v);
      return v;
    });
    ok(res, out, "Task created successfully", 201);
  } catch (e) {
    next(e);
  }
});
router.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.enum(statuses).optional(),
        priority: z.enum(priorities).optional(),
      })
      .parse(req.query);
    let where = "WHERE 1=1",
      a = [];
    for (const k of ["status", "priority"])
      if (q[k]) {
        where += ` AND ${k}=?`;
        a.push(q[k]);
      }
    const [[count]] = await pool.execute(
      `SELECT COUNT(*) total FROM tasks ${where}`,
      a,
    );
    const [data] = await pool.execute(
      `SELECT * FROM tasks ${where} ORDER BY status,position,id LIMIT ? OFFSET ?`,
      [...a, q.limit, (q.page - 1) * q.limit],
    );
    ok(res, {
      items: data,
      pagination: { page: q.page, limit: q.limit, total: count.total },
    });
  } catch (e) {
    next(e);
  }
});
router.get("/:id", async (req, res, next) => {
  try {
    const [r] = await pool.execute("SELECT * FROM tasks WHERE id=?", [
      req.params.id,
    ]);
    if (!r[0]) throw new AppError(404, "Task not found", "NOT_FOUND");
    const [s] = await pool.execute(
      "SELECT s.*, COALESCE((SELECT CONCAT('[', GROUP_CONCAT(JSON_OBJECT('id',u.id,'name',u.name,'email',u.email) SEPARATOR ','), ']') FROM subtask_assignments a JOIN users u ON u.id=a.employee_id WHERE a.subtask_id=s.id), '[]') employees FROM subtasks s WHERE s.task_id=? ORDER BY s.status,s.position",
      [req.params.id],
    );
    ok(res, {
      ...r[0],
      subtasks: s.map((subtask) => ({
        ...subtask,
        // MariaDB/mysql2 returns JSON expressions as strings; keep the HTTP type stable.
        employees: typeof subtask.employees === "string" ? JSON.parse(subtask.employees) : (subtask.employees || []),
      })),
    });
  } catch (e) {
    next(e);
  }
});
router.patch("/:id", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const b = task.partial().omit({ status: true }).parse(req.body);
    const out = await transaction(async (c) => {
      const [r] = await c.execute("SELECT * FROM tasks WHERE id=? FOR UPDATE", [
        req.params.id,
      ]);
      if (!r[0]) throw new AppError(404, "Task not found", "NOT_FOUND");
      const n = { ...r[0], ...b, deadline: formatMySqlUtc(b.deadline ?? r[0].deadline) };
      await c.execute(
        "UPDATE tasks SET title=?,description=?,deadline=?,priority=? WHERE id=?",
        [n.title, n.description, n.deadline, n.priority, req.params.id],
      );
      await audit(c, req.user.id, "task", req.params.id, "UPDATED", r[0], n);
      return n;
    });
    ok(res, out, "Task updated successfully");
  } catch (e) {
    next(e);
  }
});
router.patch("/:id/move", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    const b = moveBody.parse(req.body);
    ok(
      res,
      await transaction((c) => move(c, "tasks", req.params.id, b, req.user.id)),
      "Task moved successfully",
    );
  } catch (e) {
    next(e);
  }
});
router.delete("/:id", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    await transaction(async (c) => {
      const [r] = await c.execute("SELECT * FROM tasks WHERE id=? FOR UPDATE", [
        req.params.id,
      ]);
      if (!r[0]) throw new AppError(404, "Task not found", "NOT_FOUND");
      await c.execute("DELETE FROM tasks WHERE id=?", [req.params.id]);
      await audit(c, req.user.id, "task", req.params.id, "DELETED", r[0], null);
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
module.exports = router;
