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

function extractFileNameFromImageUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    // Fallback for non-URL values
    const last = String(imageUrl || '')
      .split(/[\\/]/)
      .filter(Boolean)
      .pop();
    return last ? decodeURIComponent(last) : null;
  }
}

function toggleJokerSuffix(fileName) {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  if (/Y$/i.test(base)) {
    return `${base.slice(0, -1)}${ext}`;
  }
  return `${base}Y${ext}`;
}

const seedCards = async () => {
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM cards');
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

    // If cards already exist, try to repair broken image_url entries (e.g. renamed ...png -> ...Y.png).
    if (rows[0].c > 0) {
      const fileSet = new Set(files);
      const { rows: cards } = await pool.query('SELECT id, image_url FROM cards');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let repaired = 0;

        for (const card of cards) {
          const currentFile = extractFileNameFromImageUrl(card.image_url);
          if (!currentFile) continue;
          if (fileSet.has(currentFile)) continue;

          const toggled = toggleJokerSuffix(currentFile);
          if (!fileSet.has(toggled)) continue;

          const newUrl = String(card.image_url).replace(encodeURIComponent(currentFile), encodeURIComponent(toggled));
          await client.query('UPDATE cards SET image_url = $1, updated_at = NOW() WHERE id = $2', [newUrl, card.id]);
          repaired += 1;
        }

        await client.query('COMMIT');
        if (repaired > 0) {
          console.log(`Eksik kart resimleri onarildi: ${repaired} adet.`);
        } else {
          console.log('Kart verileri zaten mevcut.');
        }
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      return;
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
          [parsed.name, parsed.attack, parsed.defense, parsed.health, parsed.joker, imageUrl]
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
