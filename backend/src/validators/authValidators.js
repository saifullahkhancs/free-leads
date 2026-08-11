const { z } = require("zod");

const registerSchema = z.object({
  firstName: z.string().min(1).max(150),
  lastName: z.string().min(1).max(150),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(150).optional(),
  lastName: z.string().trim().min(1).max(150).optional(),
  // `location` is optional; pass lat/lng as null to clear the saved location.
  // When a location is set, the map picker sends all six fields together.
  location: z
    .object({
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      city: z.string().trim().max(150).nullable().optional(),
      region: z.string().trim().max(150).nullable().optional(),
      country: z.string().trim().max(150).nullable().optional(),
      label: z.string().trim().max(300).nullable().optional(),
    })
    .optional(),
  // Default directory filters picked on the profile page. Free-text (max 150,
  // matching leads.category / leads.industry) because the picker also allows a
  // custom value when the facet list doesn't cover the user's niche. An empty
  // string clears the saved choice.
  interestCategory: z.string().trim().max(150).nullable().optional(),
  interestIndustry: z.string().trim().max(150).nullable().optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
};
