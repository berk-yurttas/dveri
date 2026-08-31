const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { getPool } = require('./db');

// Read the excel file to get card data
function getCardsFromExcel() {
  const excelPath = path.join(__dirname, '..', 'card_images', 'aselsan_kart_oyunu (1).xlsx');
  if (!fs.existsSync(excelPath)) {
    console.warn(`Excel dosyası bulunamadı: ${excelPath}. Sadece card_images kontrol edilecek.`);
    return null;
  }

  const workbook = xlsx.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  const cards = [];
  
  // Skip the first row (headers)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[1]) continue;
    
    const urunAdi = String(row[1]).trim().replace(/\//g, '-');
    const attack = Number(row[3]) || 12;
    const defense = Number(row[4]) || 8;
    
    cards.push({
      name: urunAdi,
      attack: attack,
      defense: defense
    });
  }
  
  return cards;
}

const seedCards = async () => {
  console.log("Card Senkronizasyonu başlıyor...");
  try {
    const pool = getPool();
    const imageBaseUrl = (process.env.CARD_IMAGE_BASE_URL || `http://localhost:${process.env.PORT || 5010}`).replace(/\/$/, '');
    
    const excelCards = getCardsFromExcel();
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let insertedCount = 0;
      let updatedCount = 0;
      
      if (excelCards) {
        // Sync from Excel
        for (const card of excelCards) {
          const imageUrl = `${imageBaseUrl}/card-images/${encodeURIComponent(card.name + '.png')}`;
          
          // Check if card exists
          const res = await client.query('SELECT id, health FROM cards WHERE name = $1', [card.name]);
          
          if (res.rows.length > 0) {
            // Update existing card (do not overwrite health)
            await client.query(
              `UPDATE cards SET attack = $1, defense = $2, image_url = $3, updated_at = NOW() WHERE id = $4`,
              [card.attack, card.defense, imageUrl, res.rows[0].id]
            );
            updatedCount++;
          } else {
            // Generate random health between 70 and 85 for new cards
            const randomHealth = Math.floor(Math.random() * 16) + 70;
            
            await client.query(
              `INSERT INTO cards (name, attack, defense, health, joker, image_url)
               VALUES ($1, $2, $3, $4, false, $5)`,
              [card.name, card.attack, card.defense, randomHealth, imageUrl]
            );
            insertedCount++;
          }
        }
      }
      
      await client.query('COMMIT');
      console.log(`Card Senkronizasyonu tamamlandı: ${insertedCount} yeni kart eklendi, ${updatedCount} kart güncellendi.`);
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Senkronizasyon hatası:", e);
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Kart verileri eklenirken/güncellenirken hata:', error);
  }
};

module.exports = seedCards;
