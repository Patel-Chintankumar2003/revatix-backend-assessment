const router = require("express").Router();
const { z } = require("zod");
const { pool, transaction } = require("../config/database");
const { auth, roles } = require("../middleware/auth");
const { AppError, ok } = require("../utils/http");
const { audit } = require("../services/audit");
const { move } = require("../services/reorder");
const statuses = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const body = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  status: z.enum(statuses).default("TODO"),
  position: z.number().int().min(0).optional(),
});
router.use(auth);
const editable = async (c, id, user, write = false) => {
  const [r] = await c.execute(
    "SELECT s.*,t.created_by FROM subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=? FOR UPDATE",
    [id],
  );
  if (!r[0]) throw new AppError(404, "Subtask not found", "NOT_FOUND");
  if (user.role === "EMPLOYEE" && write) {
    const [a] = await c.execute(
      "SELECT 1 FROM subtask_assignments WHERE subtask_id=? AND employee_id=?",
      [id, user.id],
    );
    if (!a[0])
      throw new AppError(403, "Subtask is not assigned to you", "FORBIDDEN");
  }
  return r[0];
};
router.post(
  "/tasks/:taskId/subtasks",
  roles("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      const b = body.parse(req.body);
      const v = await transaction(async (c) => {
        const [t] = await c.execute(
          "SELECT id FROM tasks WHERE id=? FOR UPDATE",
          [req.params.taskId],
        );
        if (!t[0]) throw new AppError(404, "Task not found", "NOT_FOUND");
        const [[p]] = await c.execute(
          "SELECT COALESCE(MAX(position)+1,0) p FROM subtasks WHERE task_id=? AND status=? FOR UPDATE",
          [req.params.taskId, b.status],
        );
        const [r] = await c.execute(
          "INSERT INTO subtasks(task_id,title,description,status,position) VALUES(?,?,?,?,?)",
          [req.params.taskId, b.title, b.description || null, b.status, p.p],
        );
        const x = {
          id: r.insertId,
          taskId: +req.params.taskId,
          ...b,
          position: p.p,
        };
        await audit(c, req.user.id, "subtask", r.insertId, "CREATED", null, x);
        return x;
      });
      ok(res, v, "Subtask created successfully", 201);
    } catch (e) {
      next(e);
    }
  },
);
router.get("/tasks/:taskId/subtasks", async (req, res, next) => {
  try {
    const [r] = await pool.execute(
      "SELECT * FROM subtasks WHERE task_id=? ORDER BY status,position,id",
      [req.params.taskId],
    );
    ok(res, r);
  } catch (e) {
    next(e);
  }
});
router.get("/subtasks/:id", async (req, res, next) => {
  try {
    const [r] = await pool.execute(
      "SELECT s.*,t.title task_title FROM subtasks s JOIN tasks t ON t.id=s.task_id WHERE s.id=?",
      [req.params.id],
    );
    if (!r[0]) throw new AppError(404, "Subtask not found", "NOT_FOUND");
    ok(res, r[0]);
  } catch (e) {
    next(e);
  }
});
router.patch("/subtasks/:id", async (req, res, next) => {
  try {
    const b = body.partial().parse(req.body);
    const v = await transaction(async (c) => {
      const old = await editable(c, req.params.id, req.user, true);
      if (
        req.user.role === "EMPLOYEE" &&
        Object.keys(b).some((k) => k !== "status")
      )
        throw new AppError(
          403,
          "Employees may only update status",
          "FORBIDDEN",
        );
      let ordering;
      if (b.status && b.status !== old.status) {
        ordering = await move(c, "subtasks", old.id, { taskId: old.task_id, status: b.status, position: b.position ?? Number.MAX_SAFE_INTEGER }, req.user.id);
      } else if (b.position !== undefined && req.user.role !== "EMPLOYEE") {
        ordering = await move(c, "subtasks", old.id, { taskId: old.task_id, status: old.status, position: b.position }, req.user.id);
      }
      const n = { ...old, ...b, ...(ordering || {}) };
      if (b.title !== undefined || b.description !== undefined) {
        await c.execute("UPDATE subtasks SET title=?,description=? WHERE id=?", [n.title, n.description, old.id]);
        await audit(c, req.user.id, "subtask", old.id, "UPDATED", old, n);
      }
      return n;
    });
    ok(res, v, "Subtask updated successfully");
  } catch (e) {
    next(e);
  }
});
router.patch(
  "/subtasks/:id/move",
  roles("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      const b = z
        .object({ status: z.enum(statuses), position: z.number().int().min(0) })
        .parse(req.body);
      const v = await transaction(async (c) => {
        const old = await editable(c, req.params.id, req.user);
        return move(
          c,
          "subtasks",
          req.params.id,
          { ...b, taskId: old.task_id },
          req.user.id,
        );
      });
      ok(res, v, "Subtask moved successfully");
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/subtasks/:id",
  roles("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      await transaction(async (c) => {
        const old = await editable(c, req.params.id, req.user);
        await c.execute("DELETE FROM subtasks WHERE id=?", [old.id]);
        await audit(c, req.user.id, "subtask", old.id, "DELETED", old, null);
      });
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/subtasks/:id/assignments",
  roles("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      const b = z
        .object({ employeeIds: z.array(z.number().int().positive()).min(1) })
        .parse(req.body);
      const v = await transaction(async (c) => {
        await editable(c, req.params.id, req.user);
        const [u] = await c.execute(
          `SELECT id FROM users WHERE role='EMPLOYEE' AND id IN (${b.employeeIds.map(() => "?").join(",")}) FOR UPDATE`,
          b.employeeIds,
        );
        if (u.length !== new Set(b.employeeIds).size)
          throw new AppError(
            422,
            "All assignees must be existing employees",
            "INVALID_EMPLOYEE",
          );
        const insertedEmployeeIds = [];
        for (const x of b.employeeIds) {
          const [result] = await c.execute(
            "INSERT IGNORE INTO subtask_assignments(subtask_id,employee_id) VALUES(?,?)",
            [req.params.id, x],
          );
          if (!result.affectedRows) continue;
          insertedEmployeeIds.push(x);
          await audit(
            c,
            req.user.id,
            "subtask_assignment",
            req.params.id,
            "ASSIGNED",
            null,
            { employeeId: x },
          );
        }
        return {
          employeeIds: b.employeeIds,
          insertedEmployeeIds,
          policy: "Duplicate assignments are idempotent",
        };
      });
      ok(res, v, "Employees assigned successfully", 201);
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/subtasks/:id/assignments/:employeeId",
  roles("ADMIN", "MANAGER"),
  async (req, res, next) => {
    try {
      await transaction(async (c) => {
        const [r] = await c.execute(
          "DELETE FROM subtask_assignments WHERE subtask_id=? AND employee_id=?",
          [req.params.id, req.params.employeeId],
        );
        if (!r.affectedRows)
          throw new AppError(404, "Assignment not found", "NOT_FOUND");
        await audit(
          c,
          req.user.id,
          "subtask_assignment",
          req.params.id,
          "UNASSIGNED",
          { employeeId: +req.params.employeeId },
          null,
        );
      });
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  },
);
module.exports = router;
