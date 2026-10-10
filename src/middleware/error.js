const { ZodError } = require("zod");
module.exports = (err, _req, res, _next) => {
  if (err instanceof ZodError)
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.issues,
    });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({
    success: false,
    message: status === 500 ? "Internal server error" : err.message,
    code: err.code || "INTERNAL_ERROR",
    ...(err.errors ? { errors: err.errors } : {}),
  });
};
