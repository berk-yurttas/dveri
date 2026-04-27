// src/components/Game.js
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';

const Game = () => {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [selectedPlayerAttack, setSelectedPlayerAttack] = useState(null);
  const [selectedComputerTarget, setSelectedComputerTarget] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [damagedPlayerIndex, setDamagedPlayerIndex] = useState(null);
  const [damagedComputerIndex, setDamagedComputerIndex] = useState(null);

  useEffect(() => {
    const startGame = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/game/start`);
        setGameState(res.data);
      } catch (err) {
        setError('Oyun başlatılırken hata: ' + err.message);
      }
    };
    startGame();
  }, []);

  const handleAttack = async () => {
    if (selectedPlayerAttack === null || selectedComputerTarget === null) {
      setError('Hem saldıran kartı hem de hedefi seçmelisiniz.');
      return;
    }
    try {
      const res = await axios.post(`${API_BASE}/api/game/attack`, {
        gameId: gameState.gameId,
        playerAttackIndex: selectedPlayerAttack,
        playerTargetIndex: selectedComputerTarget,
      });
      const { playerResult, computerResult } = res.data.result;

      if (playerResult?.attackerName) {
        setDamagedComputerIndex(selectedComputerTarget);
        setTimeout(() => setDamagedComputerIndex(null), 500);
      }
      if (computerResult?.attackerName) {
        setDamagedPlayerIndex(selectedPlayerAttack);
        setTimeout(() => setDamagedPlayerIndex(null), 500);
      }

      setGameState({
        gameId: res.data.gameId,
        currentRound: res.data.currentRound,
        playerCards: res.data.playerCards,
        computerCards: res.data.computerCards,
      });

      const messages = [];
      if (playerResult?.attackerName) {
        messages.push(`Saldıran: ${playerResult.attackerName} → Savunan: ${playerResult.defenderName} | HP: -${playerResult.xpReduction}`);
      }
      if (computerResult?.attackerName) {
        messages.push(`PC Saldırısı: ${computerResult.attackerName} → ${computerResult.defenderName} | HP: -${computerResult.xpReduction}`);
      }
      setMessage(messages.join('\n'));
      setSelectedPlayerAttack(null);
      setSelectedComputerTarget(null);
      setError('');
    } catch (err) {
      setError('Saldırı işlemi sırasında hata: ' + err.message);
    }
  };

  if (!gameState) {
    return (
      <div style={S.loadingPage}>
        <div style={S.spinner} />
        <p style={{ color: '#aab', marginTop: 16, fontSize: 14 }}>Oyun başlatılıyor...</p>
      </div>
    );
  }

  const gameOver = gameState.playerCards.length === 0 || gameState.computerCards.length === 0;
  const outcome = gameState.playerCards.length === 0 ? 'Kaybettiniz.' : gameState.computerCards.length === 0 ? 'Kazandınız!' : '';

  const playerXP = gameState.playerCards.reduce((s, c) => s + (c.health || 0), 0);
  const computerXP = gameState.computerCards.reduce((s, c) => s + (c.health || 0), 0);

  const renderCard = (card, index, isPlayer) => {
    const isSelected = isPlayer ? selectedPlayerAttack === index : selectedComputerTarget === index;
    const isDamaged = isPlayer ? damagedPlayerIndex === index : damagedComputerIndex === index;
    const selectFn = isPlayer ? () => setSelectedPlayerAttack(index) : () => setSelectedComputerTarget(index);

    return (
      <div key={index} onClick={selectFn}
        style={{ ...S.card, ...(isSelected ? S.cardSelected : {}), ...(isDamaged ? S.cardDamage : {}) }}>
        <img src={card.imageUrl} alt={card.name} style={S.cardImg} />
        <div style={{ ...S.cardStat, ...S.cardAttack }}>{card.attack ?? ''}</div>
        <div style={{ ...S.cardStat, ...S.cardDefense }}>{card.defense ?? ''}</div>
        <div style={S.cardHp}>{card.health}</div>
        <div style={S.cardName}>{card.name}</div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <style>{`
        @keyframes damageAnim { 0%{transform:scale(1)} 25%{transform:scale(1.08)} 50%{transform:scale(0.92)} 75%{transform:scale(1.04)} 100%{transform:scale(1)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .game-cards::-webkit-scrollbar{height:6px} .game-cards::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.25);border-radius:3px} .game-cards::-webkit-scrollbar-track{background:transparent}
        .game-cards{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.25) transparent}
      `}</style>

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerSide}>
          <span style={S.xpLabel}>SEN</span>
          <span style={S.xpValue}>{playerXP} XP</span>
        </div>
        <div style={S.headerCenter}>
          <h2 style={S.title}>ASELSAN KALKAN</h2>
          <span style={S.roundBadge}>Tur {gameState.currentRound}</span>
        </div>
        <div style={S.headerSide}>
          <span style={S.xpLabel}>BİLGİSAYAR</span>
          <span style={S.xpValue}>{computerXP} XP</span>
        </div>
      </div>

      {/* Exit button */}
      <button
        onClick={() => { if (window.confirm('Oyundan çıkmak istediğine emin misin?')) navigate('/home'); }}
        style={S.exitBtn}>
        ✕ Çık
      </button>

      {/* Banners */}
      {gameOver && <div style={S.gameOverBanner}>Oyun Bitti! {outcome}</div>}
      {error && <div style={S.errorBanner}>{error}</div>}
      {message && <div style={S.msgBanner}><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{message}</pre></div>}

      {/* Main game area */}
      <div style={S.body}>
        {/* Player cards */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Senin Kartların — Saldırı kartını seç</div>
          <div style={S.cardRow} className="game-cards">
            {gameState.playerCards.map((c, i) => renderCard(c, i, true))}
          </div>
        </div>

        {/* Attack button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
          <button disabled={gameOver} onClick={handleAttack}
            style={{ ...S.attackBtn, ...(gameOver ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}>
            Saldır
          </button>
        </div>

        {/* Computer cards */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Bilgisayar Kartları — hedef seç</div>
          <div style={S.cardRow} className="game-cards">
            {gameState.computerCards.map((c, i) => renderCard(c, i, false))}
          </div>
        </div>
      </div>
    </div>
  );
};

const S = {
  page: { position: 'fixed', inset: 0, background: 'linear-gradient(160deg,#0a1628,#0e2240,#162d50)', fontFamily: 'Arial,sans-serif', color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  loadingPage: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a1628' },
  spinner: { width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)', borderTopColor: '#1890ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', flexShrink: 0 },
  headerSide: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 100 },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  xpLabel: { fontSize: 11, fontWeight: 700, color: '#8af', textTransform: 'uppercase', letterSpacing: 1 },
  xpValue: { fontSize: 22, fontWeight: 700, color: '#ff4d4f', textShadow: '0 0 8px rgba(255,0,0,0.3)' },
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: 2, color: '#fff' },
  roundBadge: { marginTop: 4, fontSize: 12, background: 'rgba(0,120,255,0.4)', padding: '2px 14px', borderRadius: 10, fontWeight: 600 },

  gameOverBanner: { textAlign: 'center', background: 'rgba(220,20,60,0.85)', padding: '10px 0', fontSize: 18, fontWeight: 700, flexShrink: 0 },
  errorBanner: { textAlign: 'center', background: 'rgba(200,0,0,0.6)', padding: '6px 0', fontSize: 13, flexShrink: 0 },
  msgBanner: { textAlign: 'center', background: 'rgba(0,60,120,0.7)', padding: '8px 16px', fontSize: 13, fontWeight: 600, flexShrink: 0 },

  body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 24px', minHeight: 0 },
  section: { marginBottom: 4 },
  sectionLabel: { fontSize: 13, fontWeight: 700, color: '#8af', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center', marginBottom: 6 },
  cardRow: { display: 'flex', gap: 12, justifyContent: 'center', overflowX: 'auto', padding: '4px 0' },

  card: { position: 'relative', width: 140, minWidth: 140, height: 220, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', border: '2px solid transparent', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', transition: 'border 0.15s, box-shadow 0.15s, transform 0.15s', flexShrink: 0, background: '#0a1628' },
  cardSelected: { border: '2px solid #00c8ff', boxShadow: '0 0 14px 2px rgba(0,200,255,0.5)', transform: 'translateY(-4px)' },
  cardDamage: { animation: 'damageAnim 0.5s ease-in-out' },
  cardImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  cardStat: { position: 'absolute', left: '4%', background: '#0d1b2e', padding: '0px 5px', borderRadius: 3, fontSize: 11, fontWeight: 800, lineHeight: '14px', zIndex: 2, textShadow: '0 1px 2px rgba(0,0,0,0.6)' },
  cardAttack: { top: '27%', color: '#ff4d4f', boxShadow: '0 0 10px rgba(255,77,79,0.25)' },
  cardDefense: { top: '42%', color: '#4fdbff', boxShadow: '0 0 10px rgba(79,219,255,0.22)' },
  cardHp: { position: 'absolute', bottom: '40%', left: '18%', background: '#0d1b2e', color: '#4f4', padding: '1px 7px', borderRadius: 3, fontSize: 13, fontWeight: 700, lineHeight: '18px', zIndex: 2 },
  cardName: { position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', color: '#fff', padding: '1px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', zIndex: 2 },

  attackBtn: { background: 'linear-gradient(135deg,#dc3545,#c82333)', color: '#fff', border: 'none', padding: '12px 40px', borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer', letterSpacing: 1, boxShadow: '0 2px 12px rgba(220,20,60,0.4)', transition: 'opacity 0.2s' },
  exitBtn: { position: 'fixed', bottom: 70, right: 20, zIndex: 20, padding: '8px 20px', fontSize: 13, fontWeight: 700, background: 'rgba(140,0,0,0.8)', color: '#fff', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 20, cursor: 'pointer', letterSpacing: 0.5, boxShadow: '0 2px 10px rgba(0,0,0,0.5)' },
};

export default Game;
