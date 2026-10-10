const jwt = require("jsonwebtoken");
const { AppError } = require("../utils/http");
const auth = (req, _res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token)
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") throw new AppError(500, "JWT_SECRET is required in production", "CONFIGURATION_ERROR");
      throw new AppError(500, "JWT_SECRET is not configured", "CONFIGURATION_ERROR");
    }
    req.user = jwt.verify(token, secret);
    next();
  } catch (e) {
    next(
      e.status
        ? e
        : new AppError(401, "Invalid or expired token", "UNAUTHORIZED"),
    );
  }
};
const roles =
  (...allowed) =>
  (req, _res, next) =>
    allowed.includes(req.user.role)
      ? next()
      : next(new AppError(403, "Insufficient permissions", "FORBIDDEN"));
module.exports = { auth, roles };
