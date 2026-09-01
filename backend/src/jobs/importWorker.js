const fs = require("fs");
const { Worker } = require("bullmq");
const env = require("../config/env");
const leadService = require("../services/leadService");
const importJobService = require("../services/importJobService");
const { createConnection, IMPORT_QUEUE_NAME } = require("./importQueue");

/**
 * BullMQ worker for background CSV imports.
 *
 * The HTTP request only stages the uploaded CSV on disk and enqueues the job
 * id; this worker streams the file through the existing lead import pipeline
 * (geo resolution, dedup, batched inserts committed per batch) and writes
 * live progress to the import_jobs row, which the frontend polls.
 */

let worker = null;

async function processImportJob(bullJob) {
  const { jobId } = bullJob.data || {};
  if (!jobId) return;

  const job = await importJobService.getJobInternal(jobId);
  if (!job) {
    // eslint-disable-next-line no-console
    console.warn(`[import-worker] Job ${jobId} not found in import_jobs — skipping`);
    return;
  }
  if (job.status !== "queued") return; // cancelled or already handled

  if (await importJobService.isCancelRequested(jobId)) {
    await importJobService.markFinished(jobId, "cancelled", { errorMessage: "Cancelled before start" });
    await importJobService.cleanupJobFile(jobId);
    await importJobService.clearCancelFlag(jobId);
    return;
  }

  if (!job.file_path || !fs.existsSync(job.file_path)) {
    await importJobService.markFinished(jobId, "failed", {
      errorMessage: "Uploaded file is no longer available. Please re-upload the CSV.",
    });
    return;
  }

  await importJobService.markProcessing(jobId);

  const options = job.options || {};
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 0;
  const offset = Number(options.offset) > 0 ? Number(options.offset) : 0;
  const fieldMapping = options.fieldMapping || null;

  // Throttle progress writes: one DB update per flushed batch or per 2s.
  let lastWrite = 0;
  const onProgress = async (progress) => {
    const now = Date.now();
    if (now - lastWrite < 2000) return;
    lastWrite = now;
    await importJobService
      .updateProgress(jobId, {
        processed: progress.processed,
        imported: progress.imported,
        skipped: progress.skipped,
        failed: progress.failed,
      })
      .catch(() => {});
  };

  const shouldAbort = () => importJobService.isCancelRequested(jobId);

  try {
    const stream = fs.createReadStream(job.file_path);
    const result = await leadService.importLeadsFromStream(stream, job.source || "csv_upload", {
      limit,
      offset,
      fieldMapping,
      onProgress,
      shouldAbort,
    });

    const summary = {
      processed: result.attempted ?? result.total,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      totalRows: result.total,
      errors: result.errors,
    };

    if (result.cancelled) {
      await importJobService.markFinished(jobId, "cancelled", {
        ...summary,
        errorMessage: "Cancelled by user. Rows imported before cancelling were kept.",
      });
    } else {
      await importJobService.markFinished(jobId, "completed", summary);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[import-worker] Job ${jobId} failed:`, err);
    await importJobService.markFinished(jobId, "failed", {
      errorMessage: err?.message || "Import failed",
    });
  } finally {
    await importJobService.cleanupJobFile(jobId).catch(() => {});
    await importJobService.clearCancelFlag(jobId).catch(() => {});
  }
}

/** Start the worker (idempotent). Returns the BullMQ Worker instance. */
function startImportWorker() {
  if (worker) return worker;

  worker = new Worker(IMPORT_QUEUE_NAME, processImportJob, {
    connection: createConnection(),
    concurrency: env.IMPORT_JOB_CONCURRENCY,
    // Give slow imports room: a stalled check that is too aggressive would
    // re-deliver a legitimately long-running job.
    stalledInterval: 60 * 1000,
    maxStalledCount: 2,
  });

  worker.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[import-worker] error:", err.message);
  });
  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[import-worker] BullMQ job ${job?.id} failed:`, err?.message);
  });

  importJobService.failOrphanedJobs().catch(() => {});

  // eslint-disable-next-line no-console
  console.log(`[import-worker] started (concurrency=${env.IMPORT_JOB_CONCURRENCY})`);
  return worker;
}

async function stopImportWorker() {
  if (!worker) return;
  await worker.close();
  worker = null;
}

module.exports = { startImportWorker, stopImportWorker };
