const express = require("express");
const controller = require("../controllers/authController");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/auth");
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/authValidators");
const {
  registerLimiter,
  loginLimiter,
  verifyLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/register", registerLimiter, validate(registerSchema), controller.register);
router.post("/verify-email", verifyLimiter, validate(verifyEmailSchema), controller.verifyEmail);
router.post(
  "/resend-verification",
  validate(resendVerificationSchema),
  controller.resendVerification
);
router.post("/login", loginLimiter, validate(loginSchema), controller.login);
router.post("/refresh", controller.refresh);
router.post("/logout", controller.logout);
router.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  controller.forgotPassword
);
router.post(
  "/reset-password",
  resetPasswordLimiter,
  validate(resetPasswordSchema),
  controller.resetPassword
);
router.get("/me", authenticate, controller.getMe);

module.exports = router;
