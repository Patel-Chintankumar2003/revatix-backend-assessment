const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { pool } = require("./config/database");
const errors = require("./middleware/error");

const app = express();

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Revatix Backend API is running",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      ready: "/ready",
    },
  });
});
app.get("/health", (_req, res) =>
  res.json({ success: true, message: "API is running" }),
);
app.get("/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ success: true, message: "Database is ready" });
  } catch (_e) {
    res
      .status(503)
      .json({
        success: false,
        message: "Database unavailable",
        code: "DATABASE_UNAVAILABLE",
      });
  }
});
app.use("/api/auth", require("./routes/auth"));
app.use("/api/tasks", require("./routes/tasks"));
app.use("/api", require("./routes/subtasks"));
app.use("/api/shifts", require("./routes/shifts"));
app.use("/api/employees", require("./routes/employees"));
app.use("/api/audit-logs", require("./routes/audit"));
app.use(errors);

module.exports = app;
