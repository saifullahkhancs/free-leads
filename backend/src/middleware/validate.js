const ApiError = require("../utils/ApiError");

// Validates req.body against a zod schema, replacing req.body with the
// parsed (and type-coerced) result on success.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      return next(new ApiError(422, "Validation failed", details));
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
