// src/utils/ApiResponse.js
function ok(data, meta) {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

function fail(status, message, details) {
  return { success: false, status, message, ...(details ? { details } : {}) };
}

module.exports = { ok, fail };
