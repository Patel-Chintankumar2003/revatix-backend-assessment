const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { pool } = require("../config/database");
const { AppError, ok } = require("../utils/http");
const { auth } = require("../middleware/auth");
router.post("/login", async (req, res, next) => {
  try {
    const b = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const [r] = await pool.execute("SELECT * FROM users WHERE email=?", [
      b.email,
    ]);
    const u = r[0];
    if (!u || !(await bcrypt.compare(b.password, u.password_hash)))
      throw new AppError(
        401,
        "Invalid email or password",
        "INVALID_CREDENTIALS",
      );
    if (!process.env.JWT_SECRET)
      throw new AppError(500, "JWT_SECRET is not configured", "CONFIGURATION_ERROR");
    const token = jwt.sign(
      { id: u.id, role: u.role, email: u.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
    );
    ok(
      res,
      { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } },
      "Login successful",
    );
  } catch (e) {
    next(e);
  }
});
router.get("/me", auth, async (req, res, next) => {
  try {
    const [r] = await pool.execute(
      "SELECT id,name,email,role,created_at,updated_at FROM users WHERE id=?",
      [req.user.id],
    );
    if (!r[0]) throw new AppError(401, "User no longer exists", "UNAUTHORIZED");
    ok(res, r[0]);
  } catch (e) {
    next(e);
  }
});
module.exports = router;
