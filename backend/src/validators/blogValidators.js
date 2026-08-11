const { z } = require("zod");

// Admin: create / update a blog post
const blogPostWriteSchema = z.object({
  title: z.string().trim().min(2).max(255),
  excerpt: z.string().trim().max(500).optional().nullable(),
  body: z.string().trim().min(10).max(50000),
  coverImageUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  status: z.enum(["draft", "published"]).default("draft"),
});

module.exports = { blogPostWriteSchema };
