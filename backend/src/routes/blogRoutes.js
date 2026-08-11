const express = require("express");
const blogController = require("../controllers/blogController");
const { authenticate, requireRole } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { blogPostWriteSchema } = require("../validators/blogValidators");

const router = express.Router();

// Public — list published posts
router.get("/", blogController.listPublished);

// Public — get a single published post
router.get("/:slug", blogController.getPublishedBySlug);

// Admin — list all posts
router.get(
  "/admin/all",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  blogController.adminListPosts
);

// Admin — get a single post by id
router.get(
  "/admin/:id",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  blogController.adminGetPost
);

// Admin — create a post
router.post(
  "/",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  validate(blogPostWriteSchema),
  blogController.adminCreatePost
);

// Admin — update a post
router.put(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  validate(blogPostWriteSchema),
  blogController.adminUpdatePost
);

// Admin — delete a post
router.delete(
  "/:id",
  authenticate,
  requireRole("admin", "super_admin", "editor"),
  blogController.adminDeletePost
);

module.exports = router;
