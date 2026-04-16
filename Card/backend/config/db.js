const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

let pool;

function buildPoolOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  const ssl =
    process.env.PGSSL === 'true' || /sslmode=require/i.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString, ssl };
}

async function connectDB() {
  const opts = buildPoolOptions();
  if (!opts) {
    console.error(
      'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set DATABASE_URL.'
    );
    process.exit(1);
  }
  pool = new Pool(opts);
  try {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    await pool.query('SELECT 1');
    console.log('PostgreSQL bağlantısı başarılı');
  } catch (error) {
    console.error('PostgreSQL bağlantı hatası:', error);
    process.exit(1);
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool is not initialized. Call connectDB() first.');
  }
  return pool;
}

module.exports = { connectDB, getPool };
