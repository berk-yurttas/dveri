const { getPool } = require('../config/db');
const { rowToCard } = require('../utils/cardDto');

async function findAll() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, attack, defense, health, joker, image_url, created_at, updated_at
     FROM cards ORDER BY created_at ASC`
  );
  return rows.map(rowToCard);
}

module.exports = { findAll };
