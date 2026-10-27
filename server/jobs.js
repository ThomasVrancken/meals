const crypto = require('crypto');
const { redact } = require('./llm/openai');

// Long LLM-backed endpoints (generate, ai-edit, recipe chat, chat) take up to
// ~60s+, but iOS WebKit drops any XHR that has no response after ~60s whatever
// timeout the page sets, and App Engine Standard buffers responses (no
// keep-alive streaming). So a client can send `Prefer: respond-async`: the
// route then answers 202 {jobId} right away, keeps working in the background,
// and the client polls GET /api/jobs/:id with short requests. Without the
// header the route answers synchronously as before.
//
// Jobs live in memory: fine because app.yaml pins max_instances to 1. A job
// lost to an instance restart/deploy polls as 404.

const JOB_TTL_MS = 15 * 60 * 1000;
const jobs = new Map(); // id -> {status: 'running'|'done'|'error', result?, error?, httpStatus?, createdAt}

/** {status, message} for an error, the same way the Express error handler reports it. */
function errorResponse(err) {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = status === 500 ? 'Internal server error' : redact(err.message);
  return { status, message };
}

function prune() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
}

/**
 * Run `work` (async, returns the JSON body) and send its result: synchronously,
 * or as a polled job when the client asked for `Prefer: respond-async`.
 * Validate input before calling this so bad requests still get a direct 400.
 */
async function respond(req, res, work) {
  if (!/\brespond-async\b/i.test(req.get('prefer') || '')) return res.json(await work());

  prune();
  const id = crypto.randomUUID();
  const job = { status: 'running', createdAt: Date.now() };
  jobs.set(id, job);
  const label = `${req.method} ${req.originalUrl}`;
  Promise.resolve()
    .then(work)
    .then(
      (result) => {
        job.status = 'done';
        job.result = result;
      },
      (err) => {
        const { status, message } = errorResponse(err);
        if (status >= 500) console.error(`[error] job ${label}: ${redact(err.stack || err.message)}`);
        job.status = 'error';
        job.httpStatus = status;
        job.error = message;
      }
    );
  return res.status(202).json({ jobId: id });
}

/** Public view of a job, or null if unknown/expired. */
function getJob(id) {
  prune();
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'done') return { status: 'done', result: job.result };
  if (job.status === 'error') return { status: 'error', error: job.error, httpStatus: job.httpStatus };
  return { status: 'running' };
}

module.exports = { respond, getJob, errorResponse };
