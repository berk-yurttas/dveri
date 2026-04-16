// backend/managers/pvpGameManager.js
const { v4: uuidv4 } = require('uuid');

class Game {
  constructor(playerCards, secondPlayerCards,roomId,firstPlayerName,secondPlayerName) {
    this.id = uuidv4();
    this.playerCards = playerCards;           // Player1 kartları
    this.secondPlayerCards = secondPlayerCards; // Player2 kartları
    this.currentRound = 1;
    this.roomId = roomId;
    this.firstPlayerName = firstPlayerName;
    this.secondPlayerName = secondPlayerName;
    this.pendingMoves = {}; // Örneğin: { 1: { moveId }, 2: { moveId } }
  }

  performAttack(attacker, defender) {
    const decision = attacker.attack - defender.defense;
    let xpReduction = 0;
    if (Math.abs(decision) > 0) {
      if (this.currentRound <= 5) {
        xpReduction = Math.abs(decision);
      } else if (this.currentRound <= 10) {
        xpReduction = Math.abs(decision) * 4;
      } else {
        xpReduction = Math.abs(decision) * 8;
      }
    }
    if (attacker?.joker) {
      xpReduction *= 2;
    }
    if (decision > 0) {
      defender.health -= xpReduction;
      defender.health -= 5;
      attacker.health -= 5;
      if (defender.health < 0) defender.health = 0;
      if (attacker.health < 0) attacker.health = 0;
    } else if (decision < 0) {
      attacker.health -= xpReduction;
      defender.health -= 5;
      attacker.health -= 5;
      if (defender.health < 0) defender.health = 0;
      if (attacker.health < 0) attacker.health = 0;
    }
    return { decision, xpReduction };
  }

  // Yeni playTurn: Sadece iki kart seçimine göre çalışır.
  // Parametreler: p1CardId, p2CardId
  // Eğer currentRound tek ise: p1CardId = Player1'nin saldırı kartı, p2CardId = Player2'nin savunma kartı.
  // Eğer çift ise: p1CardId = Player2'nin saldırı kartı, p2CardId = Player1'in savunma kartı.
  playTurn(p1CardId, p2CardId) {
    let attacker, defender;
    let attackIndex, defendIndex;
    if (this.currentRound % 2 === 1) {
      // Tek tur: Player1 saldırır, Player2 savunur.
      attackIndex = this.playerCards.findIndex(card => card._id.toString() === p1CardId);
      defendIndex = this.secondPlayerCards.findIndex(card => card._id.toString() === p2CardId);
      if (attackIndex === -1 || defendIndex === -1) {
        throw new Error("Geçersiz kart seçimi");
      }
      attacker = this.playerCards[attackIndex];
      defender = this.secondPlayerCards[defendIndex];
    } else {
      // Çift tur: Player2 saldırır, Player1 savunur.
      attackIndex = this.secondPlayerCards.findIndex(card => card._id.toString() === p1CardId);
      defendIndex = this.playerCards.findIndex(card => card._id.toString() === p2CardId);
      if (attackIndex === -1 || defendIndex === -1) {
        throw new Error("Geçersiz kart seçimi");
      }
      attacker = this.secondPlayerCards[attackIndex];
      defender = this.playerCards[defendIndex];
    }

    const result = this.performAttack(attacker, defender);
    result.attackerName = attacker.name;
    result.defenderName = defender.name;

    // Kartların health'i sıfırsa ilgili desteden çıkar
    if (attacker.health === 0) {
      if (this.currentRound % 2 === 1) {
        this.playerCards.splice(attackIndex, 1);
      } else {
        this.secondPlayerCards.splice(attackIndex, 1);
      }
    }
    if (defender.health === 0) {
      if (this.currentRound % 2 === 1) {
        this.secondPlayerCards.splice(defendIndex, 1);
      } else {
        this.playerCards.splice(defendIndex, 1);
      }
    }

    this.currentRound++;

    return {
      result,
      roomId: this.roomId,
      currentRound: this.currentRound,
      playerCards: this.playerCards,
      secondPlayerCards: this.secondPlayerCards,
      attackerCard: attacker,
      defenderCard: defender,
    };
  }
}

const games = {};

const createGame = (playerCards, secondPlayerCards, roomId = null, firstPlayerName = null, secondPlayerName = null) => {
  const game = new Game(playerCards, secondPlayerCards, roomId, firstPlayerName, secondPlayerName);
  games[game.id] = game;
  return game;
};

const getGame = (id) => games[id];

module.exports = { createGame, getGame };
