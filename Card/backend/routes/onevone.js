// backend/routes/onevone.js
const express = require('express');
const router = express.Router();
const cardsRepository = require('../repositories/cardsRepository');
const { createGame, getGame } = require('../managers/pvpGameManager');

const NUM_OF_CARDS = 6;
const shuffleArray = (array) => array.sort(() => 0.5 - Math.random());

router.get('/start', async (req, res) => {
  try {
    const allCards = await cardsRepository.findAll();
    if (allCards.length < NUM_OF_CARDS * 2) {
      return res.status(400).json({ error: `Yeterli kart bulunamadı (en az ${NUM_OF_CARDS * 2} kart gerek).` });
    }
    const shuffled = shuffleArray([...allCards]);
    const playerCards = shuffled.slice(0, NUM_OF_CARDS).map((card) => ({ ...card }));
    const secondPlayerCards = shuffled.slice(NUM_OF_CARDS, NUM_OF_CARDS * 2).map((card) => ({ ...card }));
    const game = createGame(playerCards, secondPlayerCards, null, 'Player1', 'Player2');
    const players = [
      { id: 'player1', playerNumber: 1, username: 'Player1' },
      { id: 'player2', playerNumber: 2, username: 'Player2' },
    ];
    const decks = {
      player1: game.playerCards,
      player2: game.secondPlayerCards,
    };
    res.json({
      gameId: game.id,
      currentRound: game.currentRound,
      playerCards: game.playerCards,
      secondPlayerCards: game.secondPlayerCards,
      players,
      decks,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/attack', (req, res) => {
  try {
    const { gameId, moveId } = req.body;
    if (!gameId || typeof moveId !== 'string') {
      return res.status(400).json({ error: 'Eksik veya hatalı parametreler' });
    }
    const game = getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Oyun bulunamadı' });
    }
    if (!game.pendingMoves) {
      game.pendingMoves = {};
    }
    if (!game.pendingMoves[1] && req.body.role === 'attack') {
      game.pendingMoves[1] = { moveId };
    } else if (!game.pendingMoves[2] && req.body.role === 'defense') {
      game.pendingMoves[2] = { moveId };
    }
    if (game.pendingMoves[1] && game.pendingMoves[2]) {
      const result = game.playTurn(game.pendingMoves[1].moveId, game.pendingMoves[2].moveId);
      game.pendingMoves = {};

      const responseData = {
        gameId: game.id,
        result: result.result,
        currentRound: result.currentRound,
        playerCards: result.playerCards,
        secondPlayerCards: result.secondPlayerCards,
        attackerCard: result.attackerCard,
        defenderCard: result.defenderCard,
      };

      const io = req.app.get('io');
      if (game.roomId) {
        io.to(game.roomId).emit('gameUpdate', { ...responseData });
      } else {
        io.emit('gameUpdate', { ...responseData });
      }
      return res.json(responseData);
    }
    return res.json({ message: 'Hamle bekleniyor.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

router.post('/finish', (req, res) => {
  try {
    const { gameId } = req.body;
    if (!gameId) {
      return res.status(400).json({ error: 'Eksik parametre: gameId' });
    }
    const game = getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Oyun bulunamadı.' });
    }

    const totalHealthPlayer1 = game.playerCards.reduce((sum, card) => sum + card.health, 0);
    const totalHealthPlayer2 = game.secondPlayerCards.reduce((sum, card) => sum + card.health, 0);

    let winner;
    if (totalHealthPlayer1 > totalHealthPlayer2) {
      winner = 'Player1';
    } else if (totalHealthPlayer2 > totalHealthPlayer1) {
      winner = 'Player2';
    } else {
      winner = 'Tie';
    }

    const nameP1 = game.firstPlayerName || 'Oyuncu 1';
    const nameP2 = game.secondPlayerName || 'Oyuncu 2';

    let message;
    if (winner === 'Tie') {
      message = 'Süre doldu! Oyun berabere bitti.';
    } else {
      const winnerDisplay = winner === 'Player1' ? nameP1 : nameP2;
      message = `Süre doldu! Kazanan: ${winnerDisplay}.`;
    }

    return res.json({ message, winner, totalHealthPlayer1, totalHealthPlayer2 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

module.exports = router;
