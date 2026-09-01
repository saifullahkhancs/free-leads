const fs = require("fs");
const { query } = require("../config/db");
const { redis } = require("../config/redis");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");

/**
 * Persistence + cancellation layer for background CSV import jobs.
 * The BullMQ queue only carries the job id — all state (progress, results,
 * errors) lives in the `import_jobs` table so it survives restarts and can
 * be listed/polled cheaply. A Redis flag is used for cooperative cancel.
 */

const CANCEL_KEY_PREFIX = "import:cancel:";
const CANCEL_TTL_SECONDS = 24 * 60 * 60;

const JOB_COLUMNS = `
  id, user_id, filename, source, status, options,
  total_rows, processed, imported, skipped, failed,
  errors, error_message, created_at, started_at, finished_at
`;

async function createJob({ userId, filename, filePath, source = "csv_upload", options = {} }) {
  const { rows } = await query(
    `INSERT INTO import_jobs (user_id, filename, file_path, source, options)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${JOB_COLUMNS}`,
    [userId, filename || null, filePath || null, source, JSON.stringify(options || {})]
  );
  return rows[0];
}

async function getJob(jobId, { userId = null, allowAny = false } = {}) {
  const { rows } = await query(
    `SELECT ${JOB_COLUMNS} FROM import_jobs WHERE id = $1`,
    [jobId]
  );
  const job = rows[0];
  if (!job) throw new ApiError(404, "Import job not found");
  if (!allowAny && userId && job.user_id && job.user_id !== userId) {
    throw new ApiError(403, "You do not have access to this import job");
  }
  return job;
}

/** Internal: includes file_path (never exposed over the API). */
async function getJobInternal(jobId) {
  const { rows } = await query(
    `SELECT ${JOB_COLUMNS}, file_path FROM import_jobs WHERE id = $1`,
    [jobId]
  );
  return rows[0] || null;
}

async function listJobs({ userId = null, allowAny = false, limit = 20 } = {}) {
  const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const params = [];
  let where = "";
  if (!allowAny && userId) {
    params.push(userId);
    where = `WHERE user_id = $${params.length}`;
  }
  params.push(cappedLimit);
  const { rows } = await query(
    `SELECT ${JOB_COLUMNS} FROM import_jobs ${where}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function markProcessing(jobId) {
  await query(
    `UPDATE import_jobs SET status = 'processing', started_at = now() WHERE id = $1`,
    [jobId]
  );
}

async function updateProgress(jobId, { processed, imported, skipped, failed, totalRows }) {
  await query(
    `UPDATE import_jobs
        SET processed = COALESCE($2, processed),
            imported  = COALESCE($3, imported),
            skipped   = COALESCE($4, skipped),
            failed    = COALESCE($5, failed),
            total_rows = COALESCE($6, total_rows)
      WHERE id = $1`,
    [jobId, processed ?? null, imported ?? null, skipped ?? null, failed ?? null, totalRows ?? null]
  );
}

async function markFinished(jobId, status, { processed, imported, skipped, failed, totalRows, errors, errorMessage } = {}) {
  const cappedErrors = Array.isArray(errors)
    ? errors.slice(0, env.IMPORT_JOB_MAX_ERRORS)
    : [];
  await query(
    `UPDATE import_jobs
        SET status = $2,
            processed = COALESCE($3, processed),
            imported  = COALESCE($4, imported),
            skipped   = COALESCE($5, skipped),
            failed    = COALESCE($6, failed),
            total_rows = COALESCE($7, total_rows),
            errors = $8,
            error_message = $9,
            finished_at = now()
      WHERE id = $1`,
    [
      jobId,
      status,
      processed ?? null,
      imported ?? null,
      skipped ?? null,
      failed ?? null,
      totalRows ?? null,
      JSON.stringify(cappedErrors),
      errorMessage || null,
    ]
  );
}

/** Ask a queued/processing job to stop. Returns the updated job row. */
async function requestCancel(jobId, { userId = null, allowAny = false } = {}) {
  const job = await getJob(jobId, { userId, allowAny });
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    return job; // already finished — nothing to cancel
  }
  await redis.set(`${CANCEL_KEY_PREFIX}${jobId}`, "1", "EX", CANCEL_TTL_SECONDS);
  if (job.status === "queued") {
    // The worker checks the cancel flag before starting, so a queued job is
    // effectively cancelled immediately; reflect that in the row.
    await markFinished(jobId, "cancelled", { errorMessage: "Cancelled before start" });
    await cleanupJobFile(jobId);
    return getJob(jobId, { userId, allowAny });
  }
  return getJob(jobId, { userId, allowAny });
}

async function isCancelRequested(jobId) {
  const flag = await redis.get(`${CANCEL_KEY_PREFIX}${jobId}`);
  return flag === "1";
}

async function clearCancelFlag(jobId) {
  await redis.del(`${CANCEL_KEY_PREFIX}${jobId}`);
}

/** Delete the staged CSV once a job reaches a terminal state. */
async function cleanupJobFile(jobId) {
  const job = await getJobInternal(jobId);
  if (job?.file_path) {
    await fs.promises.unlink(job.file_path).catch(() => {});
    await query(`UPDATE import_jobs SET file_path = NULL WHERE id = $1`, [jobId]);
  }
}

/**
 * Called once on worker startup: any job left in 'processing' by a crashed /
 * restarted server can never finish (its BullMQ entry is re-delivered, but if
 * the staged file is gone we fail it cleanly instead of leaving it stuck).
 */
async function failOrphanedJobs() {
  await query(
    `UPDATE import_jobs
        SET status = 'failed',
            error_message = 'Server restarted while the job was processing. Please re-upload the file.',
            finished_at = now()
      WHERE status = 'processing'
        AND started_at < now() - interval '1 hour'`
  );
}

module.exports = {
  createJob,
  getJob,
  getJobInternal,
  listJobs,
  markProcessing,
  updateProgress,
  markFinished,
  requestCancel,
  isCancelRequested,
  clearCancelFlag,
  cleanupJobFile,
  failOrphanedJobs,
};
