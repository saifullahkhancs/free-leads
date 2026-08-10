const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middleware/auth");

// All admin routes require authentication and admin role
router.use(authMiddleware.authenticate);
router.use(adminController.requireAdmin);

// User management
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserById);
router.post("/users", adminController.createUser);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id/active", adminController.toggleUserActive);

// Roles
router.get("/roles", adminController.getRoles);

module.exports = router;
