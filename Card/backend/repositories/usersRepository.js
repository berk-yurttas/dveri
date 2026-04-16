const { getPool } = require('../config/db');

async function findByEmail(email) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findById(id) {
  const pool = getPool();
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function createUser({ username, email, password }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, password)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, role, created_at`,
    [username, email, password]
  );
  return rows[0];
}

async function updateDeck(userId, cardIds) {
  const pool = getPool();
  await pool.query('UPDATE users SET deck = $2::jsonb, updated_at = now() WHERE id = $1', [
    userId,
    cardIds,
  ]);
}

module.exports = { findByEmail, findById, createUser, updateDeck };
