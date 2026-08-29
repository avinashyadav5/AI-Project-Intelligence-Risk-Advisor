const prisma = require('../prismaClient');

/**
 * maintenance.js — Recovers documents orphaned by a restart.
 *
 * Analysis runs in-process via setImmediate rather than in a durable job
 * queue, so a crash or redeploy mid-analysis used to leave a document stuck on
 * "Processing" forever with no way back. This sweep marks anything that has
 * been processing longer than the cutoff as Failed, which puts a clear message
 * in front of the user and makes the document eligible for re-analysis.
 *
 * A proper job queue is the real fix; this makes the failure visible and
 * recoverable in the meantime.
 */

const STUCK_AFTER_MINUTES = parseInt(process.env.ANALYSIS_TIMEOUT_MINUTES, 10) || 15;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

async function releaseStuckAnalyses() {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MINUTES * 60 * 1000);

  try {
    const { count } = await prisma.document.updateMany({
      where: { status: 'Processing', updatedAt: { lt: cutoff } },
      data: {
        status: 'Failed',
        errorMessage:
          `Analysis did not finish within ${STUCK_AFTER_MINUTES} minutes, most likely because ` +
          `the server restarted while it was running. Use "Re-analyse" to try again.`,
      },
    });

    if (count > 0) {
      console.log(`Released ${count} stuck document analysis/analyses.`);
    }
    return count;
  } catch (err) {
    console.warn('Stuck-analysis sweep failed:', err.message);
    return 0;
  }
}

/** Run once at boot, then on a timer. */
function startMaintenance() {
  releaseStuckAnalyses();
  const timer = setInterval(releaseStuckAnalyses, SWEEP_INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { startMaintenance, releaseStuckAnalyses, STUCK_AFTER_MINUTES };
