const ApiError = require("../utils/ApiError");
const env = require("../config/env");

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      detail: err.message,
      ...(err.details ? { errors: err.details } : {}),
    });
  }

  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  res.status(500).json({
    detail: env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ detail: "Not found" });
}

module.exports = { errorHandler, notFoundHandler };
