const { z } = require("zod");

// Public form payload — collected by the "Contact Us" page
const contactSubmitSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(4000),
});

// Admin: list query string
const contactListSchema = z.object({
  status: z.enum(["new", "read", "replied", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// Admin: status patch
const contactUpdateSchema = z.object({
  status: z.enum(["new", "read", "replied", "closed"]).optional(),
  admin_reply: z.string().trim().min(2).max(4000).optional(),
}).refine(
  (data) => data.status || (data.admin_reply && data.admin_reply.length > 0),
  { message: "Either status or admin_reply must be provided" }
);

module.exports = {
  contactSubmitSchema,
  contactListSchema,
  contactUpdateSchema,
};
