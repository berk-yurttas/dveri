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

async function connectDB(retries = 5, delay = 3000) {
  const opts = buildPoolOptions();
  if (!opts) {
    console.error(
      'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and set DATABASE_URL.'
    );
    process.exit(1);
  }
  pool = new Pool(opts);
  
  while (retries > 0) {
    try {
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      await pool.query('SELECT 1');
      console.log('PostgreSQL bağlantısı başarılı');
      return;
    } catch (error) {
      console.error(`PostgreSQL bağlantı hatası, ${retries - 1} deneme kaldı. Hata: ${error.message}`);
      retries -= 1;
      if (retries === 0) {
        console.error('Veritabanına bağlanılamadı, çıkılıyor.');
        process.exit(1);
      }
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool is not initialized. Call connectDB() first.');
  }
  return pool;
}

module.exports = { connectDB, getPool };
