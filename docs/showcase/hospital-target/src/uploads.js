// Product photos are stored under an uploads folder.
const path = require("node:path");

// The absolute path for an uploaded file name, inside baseDir.
function resolveUpload(baseDir, name) {
  return path.join(baseDir, name);
}

module.exports = { resolveUpload };
