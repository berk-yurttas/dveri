const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

function resolveImagesDir() {
  const candidates = [
    process.env.CARD_IMAGES_DIR,
    path.join(__dirname, '..', 'card_images'),
    path.join(__dirname, '..', '..', 'card_images'),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function toCardName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStatsFromFileName(fileName, defaults) {
  const base = path.basename(fileName, path.extname(fileName)).trim();
  const match = base.match(/^(.*)_([0-9]+)_([0-9]+)_([0-9]+)$/);
  if (!match) {
    return {
      name: toCardName(fileName),
      attack: defaults.attack,
      defense: defaults.defense,
      health: defaults.health,
      parsed: false,
    };
  }

  const [, rawName, rawAttack, rawDefense, rawHealth] = match;
  return {
    name: rawName.trim(),
    attack: Number(rawAttack),
    defense: Number(rawDefense),
    health: Number(rawHealth),
    parsed: true,
  };
}

const seedCards = async () => {
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM cards');
    if (rows[0].c > 0) {
      console.log('Kart verileri zaten mevcut.');
      return;
    }

    const imagesDir = resolveImagesDir();
    if (!imagesDir) {
      throw new Error('card_images klasoru bulunamadi. CARD_IMAGES_DIR ayarlayin.');
    }

    const files = fs
      .readdirSync(imagesDir)
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      throw new Error(`Kart resmi bulunamadi: ${imagesDir}`);
    }

    const defaults = {
      attack: Number(process.env.CARD_DEFAULT_ATTACK || 12),
      defense: Number(process.env.CARD_DEFAULT_DEFENSE || 8),
      health: Number(process.env.CARD_DEFAULT_HEALTH || 45),
    };
    const imageBaseUrl = (process.env.CARD_IMAGE_BASE_URL || `http://localhost:${process.env.PORT || 5010}`).replace(/\/$/, '');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const file of files) {
        const parsed = parseStatsFromFileName(file, defaults);
        const imageUrl = `${imageBaseUrl}/card-images/${encodeURIComponent(file)}`;

        if (!parsed.parsed) {
          console.warn(`Dosya adi NAME_ATTACK_DEFENSE_HEALTH formatinda degil, varsayilanlar kullanildi: ${file}`);
        }

        await client.query(
          `INSERT INTO cards (name, attack, defense, health, joker, image_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [parsed.name, parsed.attack, parsed.defense, parsed.health, false, imageUrl]
        );
      }

      await client.query('COMMIT');
      console.log(`Kartlar card_images klasorunden yuklendi (${files.length} adet).`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Kart verileri eklenirken hata:', error);
  }
};

module.exports = seedCards;
