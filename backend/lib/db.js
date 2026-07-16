const { Pool } = require('pg');

// One connection per serverless function instance (reused across warm
// invocations). Point DATABASE_URL at Neon's *pooled* connection string in
// production so this doesn't exhaust the database's connection limit.
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  }
  return pool;
}

module.exports = { getPool };
