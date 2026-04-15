const express = require('express');
const router = express.Router();
const usersRepository = require('../repositories/usersRepository');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.post('/assignCards', verifyToken, isAdmin, async (req, res) => {
  try {
    const { playerId, cardIds } = req.body;
    if (!playerId || !Array.isArray(cardIds)) {
      return res.status(400).json({ error: 'Eksik parametreler.' });
    }

    const player = await usersRepository.findById(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Oyuncu bulunamadı.' });
    }

    await usersRepository.updateDeck(playerId, cardIds);

    res.json({ message: 'Kartlar başarıyla atandı.', deck: cardIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
