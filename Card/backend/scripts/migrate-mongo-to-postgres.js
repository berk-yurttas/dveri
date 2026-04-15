/**
 * One-time migration: copy `cards` and `users` from MongoDB into PostgreSQL.
 * Requires: MONGODB_URI, DATABASE_URL in env (see backend/.env.example).
 * Run from backend folder: node scripts/migrate-mongo-to-postgres.js
 *
 * Cards are inserted only if the `cards` table is empty. Users are inserted
 * when no row with the same email exists (password hashes preserved).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  const databaseUrl = process.env.DATABASE_URL;
  if (!mongoUri || !databaseUrl) {
    console.error('Set MONGODB_URI (or MONGO_URI) and DATABASE_URL in backend/.env');
    process.exit(1);
  }

  const ssl =
    process.env.PGSSL === 'true' || /sslmode=require/i.test(databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined;
  const pool = new Pool({ connectionString: databaseUrl, ssl });

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(schema);

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();

  // Priority:
  // 1) explicit env override, 2) database in Mongo URI path, 3) legacy default ("test")
  const dbNameFromEnv = process.env.MONGODB_DB_NAME || process.env.MONGO_DB_NAME;
  const dbNameFromUriMatch = mongoUri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  const dbNameFromUri = dbNameFromUriMatch ? decodeURIComponent(dbNameFromUriMatch[1] || '') : '';
  const dbName = (dbNameFromEnv || dbNameFromUri || 'test').trim();

  console.log(`Using MongoDB database: ${dbName}`);
  const mdb = mongo.db(dbName);

  const cardCol = mdb.collection('cards');
  const userCol = mdb.collection('users');

  const mcards = await cardCol.find({}).toArray();
  const { rows: cardCountRows } = await pool.query('SELECT COUNT(*)::int AS c FROM cards');

  if (cardCountRows[0].c === 0 && mcards.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const c of mcards) {
        const imageUrl = c.imageUrl || c.image_url;
        if (!imageUrl) {
          console.warn('Skipping card without imageUrl:', String(c._id));
          continue;
        }
        await client.query(
          `INSERT INTO cards (name, attack, defense, health, joker, image_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.name, c.attack, c.defense, c.health, Boolean(c.joker), imageUrl]
        );
      }
      await client.query('COMMIT');
      console.log(`Inserted ${mcards.length} cards from MongoDB.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else if (mcards.length > 0) {
    console.log(
      'PostgreSQL `cards` is not empty; skipping card import. TRUNCATE cards CASCADE (if safe) to re-import.'
    );
  }

  const musers = await userCol.find({}).toArray();
  console.log(`Mongo users: ${musers.length}`);

  for (const u of musers) {
    const email = u.email;
    if (!email) continue;
    const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (rowCount > 0) {
      console.log('Skip existing user:', email);
      continue;
    }
    await pool.query(
      `INSERT INTO users (username, email, password, role)
       VALUES ($1, $2, $3, $4)`,
      [u.username, u.email, u.password, u.role === 'admin' ? 'admin' : 'user']
    );
    console.log('Imported user:', email);
  }

  await mongo.close();
  await pool.end();
  console.log('Migration finished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
