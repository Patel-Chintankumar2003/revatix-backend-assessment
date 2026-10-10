class AppError extends Error {
  constructor(status, message, code = "REQUEST_ERROR", errors) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}
const ok = (res, data, message = "Success", status = 200) =>
  res.status(status).json({ success: true, message, data });
module.exports = { AppError, ok };
