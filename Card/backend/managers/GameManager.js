// backend/managers/gameManager.js
const { v4: uuidv4 } = require('uuid');

class Game {
  constructor(playerCards, computerCards) {
    this.id = uuidv4();
    this.playerCards = playerCards;     // Oyuncunun kartları
    this.computerCards = computerCards; // Bilgisayarın kartları
    this.currentRound = 1;
  }

  // Belirtilen saldırı: Verilen attacker ve defender kartları üzerinden hesaplama yapar.
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
    // Karar pozitifse savunanın, negatifse saldıranın health'i azalır.
    if (decision > 0) {
      defender.health -= xpReduction;
      if (defender.health < 0) defender.health = 0;
    } else if (decision < 0) {
      attacker.health -= xpReduction;
      if (attacker.health < 0) attacker.health = 0;
    }
    return { decision, xpReduction };
  }

  // Her turda: oyuncunun seçtiği hamleyi yapar ve sonrasında bilgisayar hamlesini de otomatik yapar.
  // Parametreler:
  //   playerAttackIndex: oyuncunun saldıran kartını seçtiği index
  //   playerTargetIndex: oyuncunun bilgisayardaki hedef kartı olarak seçtiği index
  playTurn(playerAttackIndex, playerTargetIndex) {
    let playerResult = null;
    let computerResult = null;

    const playerAttacker = this.playerCards[playerAttackIndex];
    const computerDefender = this.computerCards[playerTargetIndex];

    if (!playerAttacker || !computerDefender) {
      throw new Error("Geçersiz kart seçimi");
    }

    // Oyuncunun saldırısı:
    playerResult = this.performAttack(playerAttacker, computerDefender);
    playerResult.attackerName = playerAttacker.name;
    playerResult.defenderName = computerDefender.name;
    if (playerAttacker.health === 0) {
      this.playerCards.splice(playerAttackIndex, 1);
    }
    if (computerDefender.health === 0) {
      this.computerCards.splice(playerTargetIndex, 1);
    }

    // Eğer hala her iki tarafta da kart varsa, bilgisayar hamlesi:
    if (this.playerCards.length > 0 && this.computerCards.length > 0) {
      // Bilgisayar, saldırı değeri en yüksek kartını seçsin:
      let compAttackIndex = 0;
      let maxAttack = -Infinity;
      for (let i = 0; i < this.computerCards.length; i++) {
        const card = this.computerCards[i];
        if (card.attack > maxAttack) {
          maxAttack = card.attack;
          compAttackIndex = i;
        }
      }
      // Hedef olarak oyuncunun kartlarından rastgele birini seçsin:
      const randomTargetIndex = Math.floor(Math.random() * this.playerCards.length);
      const compAttacker = this.computerCards[compAttackIndex];
      const playerDefender = this.playerCards[randomTargetIndex];
      computerResult = this.performAttack(compAttacker, playerDefender);
      computerResult.attackerName = compAttacker.name;
      computerResult.defenderName = playerDefender.name;
      if (compAttacker.health === 0) {
        this.computerCards.splice(compAttackIndex, 1);
      }
      if (playerDefender.health === 0) {
        this.playerCards.splice(randomTargetIndex, 1);
      }
    }

    // Tur tamamlandığında tur sayısını artır.
    this.currentRound++;
    return {
      playerResult,
      computerResult,
      currentRound: this.currentRound,
      playerCards: this.playerCards,
      computerCards: this.computerCards,
    };
  }
}

const games = {};

const createGame = (playerCards, computerCards) => {
  const game = new Game(playerCards, computerCards);
  games[game.id] = game;
  return game;
};

const getGame = (id) => games[id];

module.exports = { createGame, getGame };
