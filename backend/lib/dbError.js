const CONSTRAINT_ERROR_CODES = new Set([
  '23503', // foreign_key_violation
  '23505', // unique_violation
  '23514', // check_violation
  '22P02' // invalid_text_representation (e.g. malformed UUID)
]);

// Postgres constraint failures (bad FK, invalid enum value, duplicate, ...) are
// caller mistakes, not server errors — surface them as 400s instead of 500s.
function respondIfDbError(res, err) {
  if (CONSTRAINT_ERROR_CODES.has(err.code)) {
    res.status(400).json({ error: err.detail || err.message });
    return true;
  }
  return false;
}

module.exports = { respondIfDbError };
