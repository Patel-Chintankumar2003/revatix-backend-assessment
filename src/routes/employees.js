const router = require("express").Router();
const { pool } = require("../config/database");
const { auth } = require("../middleware/auth");
const { AppError, ok } = require("../utils/http");
router.get("/:employeeId/shifts", auth, async (req, res, next) => {
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
router.get("/:employeeId/subtasks", auth, async (req, res, next) => {
  try {
    if (req.user.role === "EMPLOYEE" && req.user.id !== +req.params.employeeId)
      throw new AppError(403, "Forbidden", "FORBIDDEN");
    const [r] = await pool.execute(
      "SELECT s.* FROM subtasks s JOIN subtask_assignments a ON a.subtask_id=s.id WHERE a.employee_id=? ORDER BY s.status,s.position",
      [req.params.employeeId],
    );
    ok(res, r);
  } catch (e) {
    next(e);
  }
});
module.exports = router;
