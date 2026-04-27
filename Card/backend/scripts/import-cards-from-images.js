/**
 * Import cards from image files in `card_images` folder into PostgreSQL.
 *
 * Usage (from backend):
 *   npm run import:card-images
 *
 * Optional env:
 *   CARD_IMAGES_DIR=/absolute/path/to/card_images
 *   CARD_IMAGE_BASE_URL=http://localhost:5010
 *   CARD_DEFAULT_ATTACK=12
 *   CARD_DEFAULT_DEFENSE=8
 *   CARD_DEFAULT_HEALTH=45
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function resolveImagesDir() {
  const candidates = [
    process.env.CARD_IMAGES_DIR,
    path.join(__dirname, '..', '..', 'card_images'),
    path.join(__dirname, '..', 'card_images'),
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
  // Optional joker suffix "Y" at end, e.g. Name_90_80_70Y
  const match = base.match(/^(.*)_([0-9]+)_([0-9]+)_([0-9]+)(Y)?$/i);
  if (!match) {
    return {
      name: toCardName(fileName),
      attack: defaults.attack,
      defense: defaults.defense,
      health: defaults.health,
      joker: false,
      parsed: false,
    };
  }

  const [, rawName, rawAttack, rawDefense, rawHealth, jokerFlag] = match;
  return {
    name: rawName.trim(),
    attack: Number(rawAttack),
    defense: Number(rawDefense),
    health: Number(rawHealth),
    joker: !!jokerFlag,
    parsed: true,
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required in backend/.env');
    process.exit(1);
  }

  const imagesDir = resolveImagesDir();
  if (!imagesDir) {
    console.error('Could not find card images directory. Set CARD_IMAGES_DIR in backend/.env');
    process.exit(1);
  }

  const files = fs
    .readdirSync(imagesDir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(`No image files found in: ${imagesDir}`);
    process.exit(1);
  }

  const ssl =
    process.env.PGSSL === 'true' || /sslmode=require/i.test(databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined;
  const pool = new Pool({ connectionString: databaseUrl, ssl });

  const attack = Number(process.env.CARD_DEFAULT_ATTACK || 12);
  const defense = Number(process.env.CARD_DEFAULT_DEFENSE || 8);
  const health = Number(process.env.CARD_DEFAULT_HEALTH || 45);
  const defaults = { attack, defense, health };
  const imageBaseUrl = (process.env.CARD_IMAGE_BASE_URL || `http://localhost:${process.env.PORT || 5010}`).replace(/\/$/, '');

  console.log(`Using images from: ${imagesDir}`);
  console.log(`Importing ${files.length} cards...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE cards');

    for (const file of files) {
      const parsed = parseStatsFromFileName(file, defaults);
      const imageUrl = `${imageBaseUrl}/card-images/${encodeURIComponent(file)}`;

      if (!parsed.parsed) {
        console.warn(`Filename does not match NAME_ATTACK_DEFENSE_XP, using defaults: ${file}`);
      }

      await client.query(
        `INSERT INTO cards (name, attack, defense, health, joker, image_url)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [parsed.name, parsed.attack, parsed.defense, parsed.health, parsed.joker, imageUrl]
      );
    }

    await client.query('COMMIT');
    console.log('Cards imported successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Import failed:', error);
  process.exit(1);
});
