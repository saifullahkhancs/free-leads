const express = require("express");
const rateLimit = require("express-rate-limit");
const contactController = require("../controllers/contactController");
const { authenticate, requireRole } = require("../middleware/auth");
const validate = require("../middleware/validate");
const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");
const {
  contactSubmitSchema,
  contactListSchema,
  contactUpdateSchema,
} = require("../validators/contactValidators");

const router = express.Router();

// Rate-limit the public form so a single IP can't drown the support inbox.
// 5 submissions per 10 minutes is plenty for real visitors.
const publicSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 5 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    detail: "Too many contact submissions from this address. Please try again later.",
  },
});

// Public — submit a new message (no auth required)
router.post(
  "/",
  publicSubmitLimiter,
  validate(contactSubmitSchema),
  contactController.submitContact
);

// Admin — list messages
router.get(
  "/",
  authenticate,
  requireRole("admin", "super_admin"),
  asyncHandler(async (req, res, next) => {
    const parsed = contactListSchema.safeParse(req.query);
    if (!parsed.success) {
      return next(new (require("../utils/ApiError"))(422, "Invalid query", parsed.error.issues));
    }
    req.query = parsed.data;
    next();
  }),
  contactController.listMessages
);

// Admin — quick stats (used by dashboard tile)
router.get(
  "/stats",
  authenticate,
  requireRole("admin", "super_admin"),
  contactController.getStats
);

// Admin — get a single message
router.get(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  contactController.getMessage
);

// Admin — update a message (status / reply)
router.patch(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin"),
  validate(contactUpdateSchema),
  contactController.updateMessage
);

module.exports = router;
