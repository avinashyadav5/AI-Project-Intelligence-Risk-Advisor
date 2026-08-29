const fs = require('fs');
const path = require('path');

/**
 * files.js — Removes uploaded files from disk.
 *
 * Deleting a document used to remove its database row and its knowledge-base
 * chunks but leave the original file in server/uploads/ forever, so storage
 * only ever grew.
 *
 * Failures are logged rather than thrown: a missing file must not block the
 * database delete that is the actual user intent.
 */

const UPLOAD_DIR = path.join(__dirname, '../uploads');

/** Guard against a stored filename escaping the uploads directory. */
function resolveUploadPath(filename) {
  if (!filename) return null;
  const resolved = path.resolve(UPLOAD_DIR, path.basename(filename));
  if (!resolved.startsWith(path.resolve(UPLOAD_DIR))) return null;
  return resolved;
}

function removeUpload(filename) {
  const target = resolveUploadPath(filename);
  if (!target) return false;
  try {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      return true;
    }
  } catch (err) {
    console.warn(`Could not delete upload ${filename}: ${err.message}`);
  }
  return false;
}

function removeUploads(filenames = []) {
  return filenames.reduce((count, name) => count + (removeUpload(name) ? 1 : 0), 0);
}

module.exports = { removeUpload, removeUploads, UPLOAD_DIR };
