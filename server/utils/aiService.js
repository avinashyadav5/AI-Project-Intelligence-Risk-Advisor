const axios = require('axios');

/**
 * Single source of truth for reaching the Python AI microservice.
 *
 * Routes used to each declare their own FASTAPI_URL constant with different
 * defaults, which made the service address impossible to configure reliably.
 * AI_SERVICE_URL is checked first so container/orchestrator config wins, with
 * FASTAPI_URL kept for backwards compatibility with existing .env files.
 */
const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL ||
  process.env.FASTAPI_URL ||
  'http://127.0.0.1:8000';

const DEFAULT_TIMEOUT = 120000;

function url(path) {
  return `${AI_SERVICE_URL.replace(/\/$/, '')}${path}`;
}

async function post(path, body, options = {}) {
  return axios.post(url(path), body, { timeout: DEFAULT_TIMEOUT, ...options });
}

async function get(path, options = {}) {
  return axios.get(url(path), { timeout: 30000, ...options });
}

/**
 * Remove a document's chunks from the project knowledge base.
 * Failures are logged, never thrown — deleting a document must still succeed
 * if the AI service happens to be down.
 */
async function purgeDocumentFromKB(projectId, documentId) {
  try {
    await axios.delete(url(`/kb/${projectId}/document/${documentId}`), { timeout: 30000 });
    return true;
  } catch (err) {
    console.warn(`KB purge failed for document ${documentId}: ${err.message}`);
    return false;
  }
}

async function purgeProjectKB(projectId) {
  try {
    await axios.delete(url(`/kb/${projectId}`), { timeout: 30000 });
    return true;
  } catch (err) {
    console.warn(`KB purge failed for project ${projectId}: ${err.message}`);
    return false;
  }
}

module.exports = { AI_SERVICE_URL, url, post, get, purgeDocumentFromKB, purgeProjectKB };
