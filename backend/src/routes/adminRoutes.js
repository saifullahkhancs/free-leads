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

// Audit log + dedup
router.get("/audit-logs", adminController.getAuditLogs);
router.post("/leads/dedup", adminController.runDedup);

// Delete all leads
router.delete("/leads", adminController.deleteAllLeads);

// Membership Plans
router.get("/plans", adminController.getAdminPlans);
router.post("/plans", adminController.createPlan);
router.put("/plans/:id", adminController.updatePlan);
router.delete("/plans/:id", adminController.deletePlan);

module.exports = router;
