const router = require("express").Router();
const { z } = require("zod");
const { pool } = require("../config/database");
const { auth, roles } = require("../middleware/auth");
const { ok } = require("../utils/http");
router.use(auth, roles("ADMIN", "MANAGER"));
router.get("/", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        entityType: z.string().optional(),
        entityId: z.coerce.number().int().positive().optional(),
        actor: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    let w = "WHERE 1=1",
      a = [];
    for (const [field, key] of [
      ["entity_type", "entityType"],
      ["entity_id", "entityId"],
      ["actor_id", "actor"],
    ])
      if (q[key]) {
        w += ` AND ${field}=?`;
        a.push(q[key]);
      }
    const [[n]] = await pool.execute(
      `SELECT COUNT(*) total FROM audit_logs ${w}`,
      a,
    );
    const [r] = await pool.execute(
      `SELECT * FROM audit_logs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...a, q.limit, (q.page - 1) * q.limit],
    );
    ok(res, {
      items: r,
      pagination: { page: q.page, limit: q.limit, total: n.total },
    });
  } catch (e) {
    next(e);
  }
});
module.exports = router;
