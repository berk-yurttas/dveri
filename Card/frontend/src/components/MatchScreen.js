// src/components/MatchScreen.js
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';
import ThemeToggle from './ThemeToggle';

const socket = io(API_BASE);

const oldThemeBg = `${process.env.PUBLIC_URL}/images/oldThemeBg.png`;
const newThemeBg = `${process.env.PUBLIC_URL}/images/newThemeBg.png`;
const CLOSED_CARD_IMG = `${process.env.PUBLIC_URL}/images/closedCard.png`;

/** decision > 0: saldıran üstün; < 0: savunan üstün (backend ile uyumlu) */
function formatCombatBanner({ decision, xpReduction, attackerName, defenderName }) {
  const dmg = Number(xpReduction) || 0;
  if (decision > 0) {
    return `${attackerName} kazandı! ${dmg} can kadar vurdu!`;
  }
  if (decision < 0) {
    return `${defenderName} kazandı! ${dmg} can kadar vurdu!`;
  }
  return `${attackerName} — ${defenderName}: Güçler eşit!`;
}

const MatchScreen = () => {
  const [username, setUsername] = useState('');
  const [rooms, setRooms] = useState([]);
  const [status, setStatus] = useState('Lütfen oda oluşturun veya mevcut odalara katılın.');
  const [gameState, setGameState] = useState(null);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [selectedMoveId, setSelectedMoveId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allOver, setAllOver] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [resultMsg, setResultMsg] = useState('');
  const [error, setError] = useState('');
  const [shakingCards] = useState({});
  const [centerDisplay, setCenterDisplay] = useState({ attacker: null, defender: null });
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const gameDuration = 600000;

  const leftDeckRef = useRef(null);
  const rightDeckRef = useRef(null);

  const [isOldTheme, setIsOldTheme] = useState(false);
  const [lastDecision, setLastDecision] = useState(null);
  const [shakeAttacker, setShakeAttacker] = useState(false);
  const [shakeDefender, setShakeDefender] = useState(false);

  const navigate = useNavigate();
  const handleToggleTheme = () => setIsOldTheme(!isOldTheme);
  const handleExit = () => {
    if (window.confirm('Oyundan çıkmak istediğine emin misin?')) {
      if (gameState?.roomId) {
        socket.emit('leaveMatch', { roomId: gameState.roomId });
      }
      navigate('/home');
    }
  };

  useEffect(() => {
    socket.on('roomsList', (data) => setRooms(Array.isArray(data) ? data : []));
    socket.on('roomCreated', (data) => setStatus(data.message));
    socket.on('matchFound', (data) => {
      setGameState({
        gameId: data.gameId, roomId: data.roomId, currentRound: data.currentRound,
        firstPlayerName: data.firstPlayerName, secondPlayerName: data.secondPlayerName,
        decks: data.decks, players: data.players,
      });
      const myPlayer = data.players.find(p => p.id === socket.id);
      setPlayerNumber(myPlayer?.playerNumber || 1);
      setStatus('Rakip bulundu! Oyun başlıyor...');
      setStartTime(Date.now());
    });
    socket.on('gameUpdate', (data) => {
      setCenterDisplay({ attacker: data.attackerCard, defender: data.defenderCard });
      setGameState(prev => ({
        ...prev, gameId: data.gameId, currentRound: data.currentRound,
        decks: { player1: data.playerCards, player2: data.secondPlayerCards },
      }));
      if (data.result) {
        const { decision, xpReduction, attackerName, defenderName } = data.result;
        setResultMsg(formatCombatBanner({ decision, xpReduction, attackerName, defenderName }));
        setLastDecision(decision);
      }
    });
    socket.on('opponentLeft', (data) => {
      setResultMsg(data?.message || 'Rakip oyunu terk etti. Kazandınız!');
      setIsOver(true);
      setAllOver(true);
      setCenterDisplay({ attacker: null, defender: null });
    });
    socket.on('error', (data) => alert(data.message));
    return () => {
      socket.off('roomsList');
      socket.off('roomCreated');
      socket.off('matchFound');
      socket.off('gameUpdate');
      socket.off('opponentLeft');
      socket.off('error');
    };
  }, []);

  const createRoom = () => {
    if (username.trim() === '') { alert('Lütfen kullanıcı adınızı girin.'); return; }
    socket.emit('createRoom', { username });
  };
  const joinRoom = (roomId) => {
    if (username.trim() === '') { alert('Lütfen kullanıcı adınızı girin.'); return; }
    socket.emit('joinRoom', { roomId, username });
  };
  const refreshRooms = () => socket.emit('getRooms');

  const getInstruction = () => {
    if (!gameState || !playerNumber) return "";
    const isOddRound = gameState.currentRound % 2 === 1;
    if (isOddRound) return playerNumber === 1 ? "Saldıran sizsiniz — kartınızı seçin" : "Savunan sizsiniz — kartınızı seçin";
    return playerNumber === 1 ? "Savunan sizsiniz — kartınızı seçin" : "Saldıran sizsiniz — kartınızı seçin";
  };

  const handleCardClick = async (cardId) => {
    if (isSubmitting || isOver) return;
    try {
      setIsSubmitting(true);
      setSelectedMoveId(cardId);
      const isOddRound = gameState.currentRound % 2 === 1;
      const action = isOddRound ? (playerNumber === 1 ? "attack" : "defense") : (playerNumber === 1 ? "defense" : "attack");
      const res = await axios.post(`${API_BASE}/api/onevone/attack`, { gameId: gameState.gameId, moveId: cardId, role: action });
      if (res.data.message) {
        setResultMsg(res.data.message);
      } else {
        setGameState(prev => ({
          ...prev, gameId: res.data.gameId, currentRound: res.data.currentRound,
          decks: { player1: res.data.playerCards, player2: res.data.secondPlayerCards },
        }));
        if (res.data.result?.attackerCard && res.data.result?.defenderCard) {
          setCenterDisplay({ attacker: res.data.result.attackerCard, defender: res.data.result.defenderCard });
          const { decision, xpReduction, attackerName, defenderName } = res.data.result;
          setResultMsg(formatCombatBanner({ decision, xpReduction, attackerName, defenderName }));
          setLastDecision(decision);
        }
      }
      setError('');
    } catch (err) {
      setError('Hamle gönderilirken hata: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!startTime || allOver) return;
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setElapsedTime(elapsed);
      if (elapsed >= gameDuration && !isOver) finishGame();
    }, 1000);
    return () => clearInterval(intervalId);
  }, [startTime, allOver, isOver]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishGame = async () => {
    try {
      const res = await axios.post(`${API_BASE}/api/onevone/finish`, { gameId: gameState.gameId });
      if (res.data.message) { setResultMsg(res.data.message); setIsOver(true); }
    } catch (err) { setError('Oyunu bitirirken hata: ' + err.message); }
  };

  useEffect(() => {
    if (centerDisplay.attacker && centerDisplay.defender && lastDecision !== null) {
      const shakeTimer = setTimeout(() => {
        if (lastDecision > 0) { setShakeDefender(true); setTimeout(() => setShakeDefender(false), 800); }
        else if (lastDecision < 0) { setShakeAttacker(true); setTimeout(() => setShakeAttacker(false), 800); }
      }, 2000);
      const removeTimer = setTimeout(() => setCenterDisplay({ attacker: null, defender: null }), 9000);
      return () => { clearTimeout(shakeTimer); clearTimeout(removeTimer); };
    }
  }, [centerDisplay, lastDecision]);

  /* ────────── LOBBY ────────── */
  if (!gameState) {
    return (
      <div style={S.lobbyPage}>
        <div style={S.lobbyCard}>
          <h1 style={S.lobbyTitle}>ASELSAN Kalkan Oyunu</h1>
          <p style={S.lobbyStatus}>{status}</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <input type="text" placeholder="Kullanıcı adı" value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={S.lobbyInput} />
            <button onClick={createRoom} style={S.btnPrimary}>Oda Oluştur</button>
            <button onClick={refreshRooms} style={S.btnGreen}>Odaları Listele</button>
          </div>
          <h3 style={{ margin: '12px 0 8px', fontSize: 16, color: '#ccc' }}>Mevcut Odalar</h3>
          {rooms.length === 0 ? <p style={{ color: '#999' }}>Açık oda yok.</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {rooms.map((room) => (
                <li key={room.id} style={S.roomItem}>
                  <span>{room.players?.[0]?.username || 'Oda'}</span>
                  <button onClick={() => joinRoom(room.id)} style={S.btnOrange}>Katıl</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  /* ────────── GAME ────────── */
  const myDeck = playerNumber === 1 ? gameState.decks.player1 : gameState.decks.player2;
  const opponentDeck = playerNumber === 1 ? gameState.decks.player2 : gameState.decks.player1;
  const gameOver = myDeck.length === 0 || opponentDeck.length === 0;
  const outcome = gameOver ? (myDeck.length === 0 ? "Kaybettiniz." : "Kazandınız!") : "";

  if (gameOver && !allOver) setAllOver(true);

  const myXP = myDeck.reduce((sum, c) => sum + (c.health || 0), 0);
  const opponentXP = opponentDeck.reduce((sum, c) => sum + (c.health || 0), 0);
  const leftXP = playerNumber === 1 ? myXP : opponentXP;
  const rightXP = playerNumber === 1 ? opponentXP : myXP;
  const p1Name = gameState.players?.[0]?.username || 'P1';
  const p2Name = gameState.players?.[1]?.username || 'P2';
  const bgUrl = isOldTheme ? oldThemeBg : newThemeBg;
  const progressPct = Math.min((elapsedTime / gameDuration) * 100, 100);

  const renderSideCard = (card, isMine, side) => {
    const isSelected = isMine && selectedMoveId === card._id?.toString();
    const hpStyle = isMine ? S.hpBadge : S.hpBadgeOpponent;
    return (
      <div key={card._id} onClick={isMine ? () => handleCardClick(card._id) : undefined}
        className={shakingCards[card._id] ? 'shake' : ''}
        style={{ ...S.sideCard, cursor: isMine ? 'pointer' : 'default', boxShadow: isSelected ? '0 0 12px 3px rgba(0,200,255,0.8)' : '0 2px 8px rgba(0,0,0,0.3)', border: isSelected ? '2px solid #00c8ff' : '2px solid transparent' }}>
        <img src={isMine ? card.imageUrl : CLOSED_CARD_IMG} alt={card.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6 }} />
        <div style={hpStyle}>{card.health}</div>
      </div>
    );
  };

  const renderCenterCard = (card, label, shaking) => {
    if (!card) return <div style={S.centerCardEmpty}><span style={{ color: '#556' }}>{label}</span></div>;
    return (
      <div className={shaking ? 'hit-card' : ''} style={S.centerCard}>
        <div style={S.centerLabel}>{label}</div>
        <img src={card.imageUrl} alt={card.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} />
        <div style={S.centerHpBadge}>{card.health}</div>
        {shaking && <>
          <div className="hit-flash" />
          <div className="hit-slash" />
          <div className="hit-ring" />
        </>}
      </div>
    );
  };

  const leftDeck = playerNumber === 1 ? myDeck : opponentDeck;
  const rightDeck = playerNumber === 1 ? opponentDeck : myDeck;
  const leftIsMine = playerNumber === 1;
  const rightIsMine = playerNumber === 2;

  return (
    <div style={S.gamePage}>
      <style>{`
        /* ── Hit animation system ── */
        @keyframes hitShake {
          0%   { transform: translate(0, 0) rotate(0deg) scale(1); }
          10%  { transform: translate(-10px, 4px) rotate(-3deg) scale(1.04); }
          20%  { transform: translate(12px, -2px) rotate(2deg) scale(0.96); }
          30%  { transform: translate(-8px, 6px) rotate(-2deg) scale(1.03); }
          40%  { transform: translate(10px, -4px) rotate(3deg) scale(0.97); }
          50%  { transform: translate(-6px, 2px) rotate(-1deg) scale(1.02); }
          65%  { transform: translate(4px, -2px) rotate(1deg) scale(0.99); }
          80%  { transform: translate(-2px, 1px) rotate(0deg) scale(1.01); }
          100% { transform: translate(0, 0) rotate(0deg) scale(1); }
        }
        .hit-card { animation: hitShake 0.6s cubic-bezier(.36,.07,.19,.97); }

        /* Red flash overlay */
        @keyframes flashRed {
          0%   { opacity: 0; }
          15%  { opacity: 0.6; }
          40%  { opacity: 0.3; }
          60%  { opacity: 0.5; }
          100% { opacity: 0; }
        }
        .hit-flash {
          position: absolute; inset: 0; border-radius: 10px; z-index: 3;
          background: radial-gradient(ellipse at center, rgba(255,40,40,0.7) 0%, rgba(200,0,0,0.3) 50%, transparent 80%);
          animation: flashRed 0.6s ease-out forwards;
          pointer-events: none;
        }

        /* Diagonal slash streak */
        @keyframes slashIn {
          0%   { transform: translateX(-120%) rotate(-35deg); opacity: 0; }
          30%  { opacity: 1; }
          100% { transform: translateX(120%) rotate(-35deg); opacity: 0; }
        }
        .hit-slash {
          position: absolute; inset: 0; z-index: 4; overflow: hidden; pointer-events: none; border-radius: 10px;
        }
        .hit-slash::before {
          content: '';
          position: absolute; top: 20%; left: -30%; width: 160%; height: 12px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 40%, rgba(255,200,100,0.8) 60%, transparent);
          filter: blur(2px);
          animation: slashIn 0.4s ease-out forwards;
        }

        /* Expanding impact ring */
        @keyframes ringExpand {
          0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 0.8; border-width: 3px; }
          50%  { opacity: 0.5; border-width: 2px; }
          100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; border-width: 1px; }
        }
        .hit-ring {
          position: absolute; top: 50%; left: 50%; width: 100px; height: 100px;
          border: 3px solid rgba(255,100,50,0.8); border-radius: 50%;
          z-index: 4; pointer-events: none;
          animation: ringExpand 0.7s ease-out forwards;
        }

        .side-scroll::-webkit-scrollbar { width:4px; } .side-scroll::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.3); border-radius:2px; } .side-scroll::-webkit-scrollbar-track { background:transparent; }
        .side-scroll { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,0.3) transparent; }
      `}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: `url("${bgUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', zIndex: 0 }} />
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1 }} />

      {/* ── TOP BAR ── */}
      <div style={S.topBar}>
        <div style={S.topPlayerBadge}><span style={S.xpVal}>{leftXP} XP</span><span style={S.playerName}>{p1Name}</span></div>
        <div style={S.topCenter}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ThemeToggle isOldTheme={isOldTheme} onToggle={handleToggleTheme} />
            <button onClick={handleExit} style={S.exitBtn}>✕ Çık</button>
          </div>
          <div style={S.progressOuter}>
            <div style={{ ...S.progressInner, width: `${progressPct}%` }} />
            <span style={S.progressLabel}>Tur {gameState.currentRound}</span>
          </div>
          <p style={S.instruction}>{getInstruction()}</p>
        </div>
        <div style={S.topPlayerBadge}>
          <span style={S.xpVal}>{rightXP} XP</span>
          <span style={S.playerName}>{p2Name}</span>
        </div>
      </div>

      {/* ── LEFT SIDEBAR ── */}
      <div style={S.sidebarLeft} className="side-scroll" ref={leftDeckRef}>
        <div style={S.sideTitle}>{leftIsMine ? 'Senin Kartların' : 'Rakip Kartları'}</div>
        {leftDeck.map(c => renderSideCard(c, leftIsMine, 'left'))}
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div style={S.sidebarRight} className="side-scroll" ref={rightDeckRef}>
        <div style={S.sideTitle}>{rightIsMine ? 'Senin Kartların' : 'Rakip Kartları'}</div>
        {rightDeck.map(c => renderSideCard(c, rightIsMine, 'right'))}
      </div>

      {/* ── CENTER ARENA ── */}
      <div style={S.arena}>
        {gameOver && <div style={S.gameOverBanner}>Oyun Bitti! {outcome}</div>}
        {error && <div style={S.errorBanner}>{error}</div>}
        {resultMsg && <div style={S.resultBanner}>{resultMsg}</div>}

        <div style={S.battleArea}>
          {renderCenterCard(centerDisplay.attacker, 'Saldıran', shakeAttacker)}
          <div style={S.vsText}>VS</div>
          {renderCenterCard(centerDisplay.defender, 'Savunan', shakeDefender)}
        </div>
      </div>
    </div>
  );
};

/* ─────────────── STYLES ─────────────── */
const SIDEBAR_W = 240;
const TOPBAR_H = 100;

const S = {
  /* Lobby */
  lobbyPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#0a1628,#162d50)', fontFamily: 'Arial,sans-serif' },
  lobbyCard: { background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '40px 36px', maxWidth: 480, width: '90%', textAlign: 'center', color: '#fff' },
  lobbyTitle: { margin: '0 0 8px', fontSize: 28, fontWeight: 700, letterSpacing: 1 },
  lobbyStatus: { margin: '0 0 20px', fontSize: 14, color: '#aab' },
  lobbyInput: { padding: '10px 14px', fontSize: 14, borderRadius: 6, border: '1px solid #445', background: '#0d1b2e', color: '#fff', outline: 'none', flex: 1, minWidth: 140 },
  btnPrimary: { padding: '10px 18px', fontSize: 14, borderRadius: 6, border: 'none', background: '#1890ff', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnGreen: { padding: '10px 18px', fontSize: 14, borderRadius: 6, border: 'none', background: '#52c41a', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  btnOrange: { padding: '6px 14px', fontSize: 13, borderRadius: 6, border: 'none', background: '#fa8c16', color: '#fff', cursor: 'pointer', fontWeight: 600 },
  roomItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 6 },

  /* Game page - full viewport */
  gamePage: { position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: 'Arial,sans-serif', color: '#fff' },

  /* Top bar */
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, height: TOPBAR_H, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'linear-gradient(180deg,rgba(0,0,0,0.7),transparent)' },
  topPlayerBadge: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 160, gap: 4 },
  xpVal: { fontSize: 30, fontWeight: 800, color: '#ff4d4f', textShadow: '0 0 10px rgba(255,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4)', letterSpacing: 1 },
  playerName: { fontSize: 16, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,rgba(0,60,140,0.85),rgba(0,40,100,0.85))', padding: '5px 22px', borderRadius: 16, letterSpacing: 0.5, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', border: '1px solid rgba(100,180,255,0.25)' },
  topCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: 500 },
  progressOuter: { position: 'relative', width: '100%', height: 18, background: 'rgba(255,255,255,0.15)', borderRadius: 9, overflow: 'hidden', marginTop: 4 },
  progressInner: { height: '100%', background: 'linear-gradient(90deg,#0066cc,#00aaff)', transition: 'width 1s linear', borderRadius: 9 },
  progressLabel: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' },
  instruction: { margin: '6px 0 0', fontSize: 13, color: '#dde', fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.5)' },

  /* Sidebars */
  sidebarLeft: { position: 'absolute', top: TOPBAR_H, left: 0, width: SIDEBAR_W, bottom: 0, zIndex: 10, overflowY: 'auto', overflowX: 'hidden', padding: '8px 6px', background: 'rgba(0,10,25,0.75)', backdropFilter: 'blur(6px)', borderRight: '1px solid rgba(255,255,255,0.08)' },
  sidebarRight: { position: 'absolute', top: TOPBAR_H, right: 0, width: SIDEBAR_W, bottom: 0, zIndex: 10, overflowY: 'auto', overflowX: 'hidden', padding: '8px 6px', background: 'rgba(0,10,25,0.75)', backdropFilter: 'blur(6px)', borderLeft: '1px solid rgba(255,255,255,0.08)' },
  sideTitle: { position: 'sticky', top: 0, zIndex: 3, fontSize: 13, fontWeight: 700, color: '#8af', textAlign: 'center', padding: '6px 0', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, background: 'rgba(0,10,25,0.95)', backdropFilter: 'blur(4px)' },
  sideCard: { position: 'relative', width: '100%', aspectRatio: '3/4.7', borderRadius: 8, overflow: 'hidden', marginBottom: 8, transition: 'box-shadow 0.2s, border 0.2s', background: '#0a1628' },
  hpBadge: { position: 'absolute', bottom: '41%', left: '18%', background: '#0d1b2e', color: '#4f4', padding: '1px 7px', borderRadius: 3, fontSize: 13, fontWeight: 700, lineHeight: '18px', zIndex: 2 },
  hpBadgeOpponent: { position: 'absolute', bottom: 4, left: 4, background: 'rgba(0,0,0,0.8)', color: '#4f4', padding: '2px 8px', borderRadius: 4, fontSize: 14, fontWeight: 700, zIndex: 2 },

  /* Center arena */
  arena: { position: 'absolute', top: TOPBAR_H, left: SIDEBAR_W, right: SIDEBAR_W, bottom: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 },
  battleArea: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 },
  vsText: { fontSize: 28, fontWeight: 900, color: '#ff4d4f', textShadow: '0 0 12px rgba(255,0,0,0.5)' },

  centerCard: { position: 'relative', width: 200, height: 310, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.15)', background: '#0a1628' },
  centerCardEmpty: { width: 200, height: 310, borderRadius: 10, border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  centerLabel: { position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,80,180,0.8)', padding: '2px 12px', borderRadius: 10, zIndex: 2, textTransform: 'uppercase', letterSpacing: 1 },
  centerHpBadge: { position: 'absolute', bottom: '40%', left: '18%', background: '#0d1b2e', color: '#4f4', padding: '2px 9px', borderRadius: 3, fontSize: 15, fontWeight: 700, lineHeight: '20px', zIndex: 2 },

  exitBtn: { padding: '4px 14px', fontSize: 12, fontWeight: 700, background: 'rgba(140,0,0,0.8)', color: '#fff', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 14, cursor: 'pointer', letterSpacing: 0.5 },

  /* Banners */
  gameOverBanner: { background: 'rgba(220,20,60,0.85)', color: '#fff', padding: '10px 28px', borderRadius: 8, fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: 'center' },
  errorBanner: { background: 'rgba(200,0,0,0.7)', color: '#fff', padding: '6px 20px', borderRadius: 6, fontSize: 13, marginBottom: 8 },
  resultBanner: { background: 'rgba(0,60,120,0.8)', color: '#fff', padding: '8px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, marginBottom: 12, maxWidth: 500, textAlign: 'center', backdropFilter: 'blur(4px)' },
};

export default MatchScreen;
