const router = require("express").Router();
const { z } = require("zod");
const { pool, transaction } = require("../config/database");
const { auth, roles } = require("../middleware/auth");
const { AppError, ok } = require("../utils/http");
const { audit } = require("../services/audit");
const { formatMySqlUtc } = require("../utils/datetime");
const b = z
  .object({
    employeeId: z.number().int().positive(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
  })
  .refine((x) => new Date(x.startTime) < new Date(x.endTime), {
    message: "endTime must be after startTime",
  });
router.use(auth);
async function save(c, data, actor, id) {
  const mysqlData = {
    ...data,
    startTime: formatMySqlUtc(data.startTime),
    endTime: formatMySqlUtc(data.endTime),
  };
  let old;
  if (id) {
    const [r] = await c.execute("SELECT * FROM shifts WHERE id=? FOR UPDATE", [
      id,
    ]);
    if (!r[0]) throw new AppError(404, "Shift not found", "NOT_FOUND");
    old = r[0];
  }
  const ids = [
    ...new Set([mysqlData.employeeId, ...(old ? [old.employee_id] : [])]),
  ].sort((a, b) => a - b);
  for (const x of ids) {
    const [u] = await c.execute(
      "SELECT id FROM users WHERE id=? AND role='EMPLOYEE' FOR UPDATE",
      [x],
    );
    if (!u[0])
      throw new AppError(
        422,
        "employeeId must reference an employee",
        "INVALID_EMPLOYEE",
      );
  }
  const [conflict] = await c.execute(
    "SELECT id FROM shifts WHERE employee_id=? AND start_time < ? AND end_time > ? AND id != ? LIMIT 1",
    [mysqlData.employeeId, mysqlData.endTime, mysqlData.startTime, id || 0],
  );
  if (conflict[0])
    throw new AppError(
      409,
      "Employee already has an overlapping shift",
      "SHIFT_OVERLAP",
    );
  if (id) {
    await c.execute(
      "UPDATE shifts SET employee_id=?,start_time=?,end_time=? WHERE id=?",
      [mysqlData.employeeId, mysqlData.startTime, mysqlData.endTime, id],
    );
    await audit(c, actor, "shift", id, "UPDATED", old, data);
    return { id: +id, ...data };
  }
  const [r] = await c.execute(
    "INSERT INTO shifts(employee_id,start_time,end_time,created_by) VALUES(?,?,?,?)",
    [mysqlData.employeeId, mysqlData.startTime, mysqlData.endTime, actor],
  );
  await audit(c, actor, "shift", r.insertId, "CREATED", null, data);
  return { id: r.insertId, ...data };
}
router.post("/", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    ok(
      res,
      await transaction((c) => save(c, b.parse(req.body), req.user.id)),
      "Shift created successfully",
      201,
    );
  } catch (e) {
    next(e);
  }
});
router.get("/", roles("ADMIN", "MANAGER"), async (_q, res, next) => {
  try {
    const [r] = await pool.execute("SELECT * FROM shifts ORDER BY start_time");
    ok(res, r);
  } catch (e) {
    next(e);
  }
});
router.get("/employees/:employeeId/shifts", async (req, res, next) => {
  try {
    if (req.user.role === "EMPLOYEE" && req.user.id !== +req.params.employeeId)
      throw new AppError(403, "Forbidden", "FORBIDDEN");
    const [r] = await pool.execute(
      "SELECT * FROM shifts WHERE employee_id=? ORDER BY start_time",
      [req.params.employeeId],
    );
    ok(res, r);
  } catch (e) {
    next(e);
  }
});
router.get("/:id", async (req, res, next) => {
  try {
    const [r] = await pool.execute("SELECT * FROM shifts WHERE id=?", [
      req.params.id,
    ]);
    if (!r[0]) throw new AppError(404, "Shift not found", "NOT_FOUND");
    if (req.user.role === "EMPLOYEE" && r[0].employee_id !== req.user.id)
      throw new AppError(403, "Forbidden", "FORBIDDEN");
    ok(res, r[0]);
  } catch (e) {
    next(e);
  }
});
router.patch("/:id", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    ok(
      res,
      await transaction((c) =>
        save(c, b.parse(req.body), req.user.id, req.params.id),
      ),
      "Shift updated successfully",
    );
  } catch (e) {
    next(e);
  }
});
router.delete("/:id", roles("ADMIN", "MANAGER"), async (req, res, next) => {
  try {
    await transaction(async (c) => {
      const [r] = await c.execute(
        "SELECT * FROM shifts WHERE id=? FOR UPDATE",
        [req.params.id],
      );
      if (!r[0]) throw new AppError(404, "Shift not found", "NOT_FOUND");
      await c.execute("DELETE FROM shifts WHERE id=?", [req.params.id]);
      await audit(
        c,
        req.user.id,
        "shift",
        req.params.id,
        "DELETED",
        r[0],
        null,
      );
    });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
});
module.exports = router;
