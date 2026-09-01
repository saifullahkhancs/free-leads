const { Queue } = require("bullmq");
const Redis = require("ioredis");
const env = require("../config/env");

// BullMQ requires maxRetriesPerRequest: null on its connections, so it gets
// its own ioredis instances instead of reusing config/redis.js.
function createConnection() {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
}

const IMPORT_QUEUE_NAME = "lead-import";

const importQueue = new Queue(IMPORT_QUEUE_NAME, {
  connection: createConnection(),
  defaultJobOptions: {
    // The import itself is resumable-unsafe (partial batches are committed),
    // so we do NOT auto-retry: a failure is surfaced on the job record.
    attempts: 1,
    removeOnComplete: { age: 24 * 60 * 60, count: 500 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 },
  },
});

importQueue.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("[import-queue] Redis/queue error:", err.message);
});

/** Enqueue a persisted import_jobs row for background processing. */
async function enqueueImportJob(jobId) {
  await importQueue.add("import-csv", { jobId }, { jobId: String(jobId) });
}

module.exports = { importQueue, enqueueImportJob, createConnection, IMPORT_QUEUE_NAME };
