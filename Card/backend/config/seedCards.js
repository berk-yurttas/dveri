const { getPool } = require('./db');

/** Placeholder art so image_url validation passes on first seed */
const IMG = 'https://placehold.co/300x400/1a365d/ffffff/png?text=Card';

const seedCards = async () => {
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM cards');
    if (rows[0].c > 0) {
      console.log('Kart verileri zaten mevcut.');
      return;
    }

    const initialCards = [
      { name: 'Savaşçı', attack: 15, defense: 10, health: 50, imageUrl: IMG },
      { name: 'Büyücü', attack: 20, defense: 5, health: 40, imageUrl: IMG },
      { name: 'Okçu', attack: 12, defense: 8, health: 45, imageUrl: IMG },
      { name: 'Şövalye', attack: 14, defense: 12, health: 48, imageUrl: IMG },
      { name: 'Suikastçı', attack: 18, defense: 6, health: 38, imageUrl: IMG },
      { name: 'Muhafız', attack: 10, defense: 16, health: 52, imageUrl: IMG },
      { name: 'Rahip', attack: 8, defense: 14, health: 44, imageUrl: IMG },
      { name: 'Ninja', attack: 16, defense: 9, health: 42, imageUrl: IMG },
      { name: 'Tank', attack: 9, defense: 18, health: 55, imageUrl: IMG },
      { name: 'Keskin Nişancı', attack: 17, defense: 7, health: 40, imageUrl: IMG },
      { name: 'Berserker', attack: 22, defense: 4, health: 36, imageUrl: IMG },
      { name: 'Paladin', attack: 13, defense: 13, health: 46, imageUrl: IMG },
    ];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const c of initialCards) {
        await client.query(
          `INSERT INTO cards (name, attack, defense, health, joker, image_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [c.name, c.attack, c.defense, c.health, false, c.imageUrl]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    console.log('Kart verileri başarıyla eklendi.');
  } catch (error) {
    console.error('Kart verileri eklenirken hata:', error);
  }
};

module.exports = seedCards;
