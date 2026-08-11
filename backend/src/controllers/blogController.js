const { query } = require("../config/db");
const auditService = require("../services/auditService");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");

// Slugify a post title into a URL-safe string.
function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 200) || `post-${Date.now()}`;
}

// Cheap word-count → reading-time heuristic (~200 wpm).
function estimateReadingMinutes(body) {
  if (!body) return 1;
  const words = String(body).trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// Ensure a slug is unique by appending -2, -3, ... if necessary.
async function ensureUniqueSlug(base) {
  let candidate = base;
  let i = 2;
  // Limit retries to avoid any pathological loops.
  while (i < 1000) {
    const { rows } = await query(
      `SELECT 1 FROM blog_posts WHERE slug = $1 LIMIT 1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
    i += 1;
  }
  return `${base}-${Date.now()}`;
}

// ----------------------------------------------------------------------
// Public — list published posts
// ----------------------------------------------------------------------
const listPublished = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const { rows } = await query(
    `SELECT b.id, b.slug, b.title, b.excerpt, b.cover_image_url,
            b.published_at, b.reading_time_minutes, b.created_at,
            u.first_name, u.last_name
     FROM blog_posts b
     LEFT JOIN users u ON u.id = b.author_id
     WHERE b.status = 'published'
     ORDER BY b.published_at DESC NULLS LAST, b.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM blog_posts WHERE status = 'published'`
  );

  res.status(200).json({
    status: "success",
    data: {
      posts: rows,
      total: countRows[0].total,
      limit,
      offset,
    },
  });
});

// ----------------------------------------------------------------------
// Public — get a single published post by slug
// ----------------------------------------------------------------------
const getPublishedBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const { rows } = await query(
    `SELECT b.id, b.slug, b.title, b.excerpt, b.body, b.cover_image_url,
            b.published_at, b.reading_time_minutes, b.created_at,
            u.first_name, u.last_name
     FROM blog_posts b
     LEFT JOIN users u ON u.id = b.author_id
     WHERE b.slug = $1 AND b.status = 'published'
     LIMIT 1`,
    [slug]
  );
  if (!rows[0]) throw new ApiError(404, "Post not found");
  res.status(200).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — list all posts (any status) + drafts
// ----------------------------------------------------------------------
const adminListPosts = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const status = req.query.status;

  const params = [];
  const where = [];
  if (status && ["draft", "published"].includes(status)) {
    params.push(status);
    where.push(`b.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await query(
    `SELECT b.*, u.first_name, u.last_name
     FROM blog_posts b
     LEFT JOIN users u ON u.id = b.author_id
     ${whereSql}
     ORDER BY COALESCE(b.published_at, b.created_at) DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM blog_posts b ${whereSql}`,
    params.slice(0, params.length - 2)
  );

  res.status(200).json({
    status: "success",
    data: { posts: rows, total: countRows[0].total, limit, offset },
  });
});

// ----------------------------------------------------------------------
// Admin — get a single post (any status) by id
// ----------------------------------------------------------------------
const adminGetPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT b.*, u.first_name, u.last_name
     FROM blog_posts b
     LEFT JOIN users u ON u.id = b.author_id
     WHERE b.id = $1`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Post not found");
  res.status(200).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — create a new post
// ----------------------------------------------------------------------
const adminCreatePost = asyncHandler(async (req, res) => {
  const { title, excerpt, body, coverImageUrl, status } = req.body;

  const baseSlug = slugify(title);
  const slug = await ensureUniqueSlug(baseSlug);
  const readingTime = estimateReadingMinutes(body);
  const publishedAt = status === "published" ? new Date() : null;

  const { rows } = await query(
    `INSERT INTO blog_posts
       (slug, title, excerpt, body, cover_image_url, status, author_id, published_at, reading_time_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      slug,
      title,
      excerpt || null,
      body,
      coverImageUrl || null,
      status,
      req.user.id,
      publishedAt,
      readingTime,
    ]
  );

  await auditService.log({
    actorId: req.user.id,
    action: "blog_create",
    entityType: "blog_post",
    entityId: rows[0].id,
    metadata: { slug, status },
  });

  res.status(201).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — update a post (and recompute slug if title changed)
// ----------------------------------------------------------------------
const adminUpdatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, excerpt, body, coverImageUrl, status } = req.body;

  const { rows: existingRows } = await query(
    `SELECT * FROM blog_posts WHERE id = $1`,
    [id]
  );
  if (!existingRows[0]) throw new ApiError(404, "Post not found");
  const existing = existingRows[0];

  // If the title changed, regenerate the slug (keeping a unique one).
  let slug = existing.slug;
  if (title && title !== existing.title) {
    slug = await ensureUniqueSlug(slugify(title));
  }

  // When transitioning to "published" for the first time, set published_at.
  let publishedAt = existing.published_at;
  if (status === "published" && existing.status !== "published") {
    publishedAt = new Date();
  } else if (status && status !== "published") {
    // If unpublishing, keep the original published_at so re-publishing
    // doesn't show two different dates.
  }

  const readingTime = body ? estimateReadingMinutes(body) : existing.reading_time_minutes;

  const { rows } = await query(
    `UPDATE blog_posts
       SET slug = $1,
           title = $2,
           excerpt = $3,
           body = $4,
           cover_image_url = $5,
           status = $6,
           published_at = $7,
           reading_time_minutes = $8,
           updated_at = now()
     WHERE id = $9
     RETURNING *`,
    [
      slug,
      title,
      excerpt || null,
      body,
      coverImageUrl || null,
      status,
      publishedAt,
      readingTime,
      id,
    ]
  );

  await auditService.log({
    actorId: req.user.id,
    action: "blog_update",
    entityType: "blog_post",
    entityId: id,
    metadata: { slug, status },
  });

  res.status(200).json({ status: "success", data: rows[0] });
});

// ----------------------------------------------------------------------
// Admin — delete a post
// ----------------------------------------------------------------------
const adminDeletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `DELETE FROM blog_posts WHERE id = $1 RETURNING id, slug`,
    [id]
  );
  if (!rows[0]) throw new ApiError(404, "Post not found");
  await auditService.log({
    actorId: req.user.id,
    action: "blog_delete",
    entityType: "blog_post",
    entityId: id,
    metadata: { slug: rows[0].slug },
  });
  res.status(200).json({ status: "success", data: { deleted: true } });
});

module.exports = {
  listPublished,
  getPublishedBySlug,
  adminListPosts,
  adminGetPost,
  adminCreatePost,
  adminUpdatePost,
  adminDeletePost,
};
