const mysql = require("mysql2/promise");

function options() {
  const base = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL)
    : null;
  const ssl =
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: process.env.NODE_ENV === "production" }
      : undefined;
  return {
    host: base?.hostname || process.env.DB_HOST,
    port: Number(base?.port || process.env.DB_PORT || 3306),
    user: base?.username
      ? decodeURIComponent(base.username)
      : process.env.DB_USER,
    password: base?.password
      ? decodeURIComponent(base.password)
      : process.env.DB_PASSWORD,
    database: base?.pathname?.slice(1) || process.env.DB_NAME,
    ssl,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
    timezone: "Z",
  };
}
const pool = mysql.createPool(options());
module.exports = {
  pool,
  async transaction(fn) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const out = await fn(c);
      await c.commit();
      return out;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  },
};
