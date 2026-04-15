// backend/routes/game.js
const express = require('express');
const router = express.Router();
const cardsRepository = require('../repositories/cardsRepository');
const { createGame, getGame } = require('../managers/GameManager');

const NUM_OF_CARDS = 6;

const shuffleArray = (array) => array.sort(() => 0.5 - Math.random());

router.get('/start', async (req, res) => {
  try {
    const allCards = await cardsRepository.findAll();
    if (allCards.length < NUM_OF_CARDS * 2) {
      return res.status(400).json({ error: `Yeterli kart bulunamadı (en az ${NUM_OF_CARDS * 2} kart gerek).` });
    }
    const shuffled = shuffleArray([...allCards]);
    const playerCards = shuffled.slice(0, 6).map((card) => ({ ...card }));
    const computerCards = shuffled.slice(6, 12).map((card) => ({ ...card }));

    const game = createGame(playerCards, computerCards);

    res.json({
      gameId: game.id,
      currentRound: game.currentRound,
      playerCards: game.playerCards,
      computerCards: game.computerCards,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/attack', (req, res) => {
  try {
    const { gameId, playerAttackIndex, playerTargetIndex } = req.body;
    if (!gameId || typeof playerAttackIndex !== 'number' || typeof playerTargetIndex !== 'number') {
      return res.status(400).json({ error: 'Eksik veya hatalı parametreler' });
    }
    const game = getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Oyun bulunamadı' });
    }

    const result = game.playTurn(playerAttackIndex, playerTargetIndex);
    res.json({
      gameId: game.id,
      currentRound: game.currentRound,
      result,
      playerCards: game.playerCards,
      computerCards: game.computerCards,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

module.exports = router;
