import React, { useEffect, useState } from 'react';

const DiceOverlay = ({ attackerRoll, defenderRoll, attackerName, defenderName, onComplete }) => {
  const [rolling, setRolling] = useState(true);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    // 2 saniye zar dönecek, sonra duracak
    const rollTimer = setTimeout(() => {
      setRolling(false);
      setShowResult(true);
    }, 2000);

    // Sonucu gösterdikten 1.5 saniye sonra onComplete çağır
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 4500);

    return () => {
      clearTimeout(rollTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  // CSS 3D Cube faces for 1-6
  const getTransform = (roll) => {
    if (rolling) return ''; // Rolling is handled by css animation
    switch (roll) {
      case 1: return 'rotateX(0deg) rotateY(0deg)';
      case 2: return 'rotateX(90deg) rotateY(0deg)';
      case 3: return 'rotateX(0deg) rotateY(90deg)';
      case 4: return 'rotateX(0deg) rotateY(-90deg)';
      case 5: return 'rotateX(-90deg) rotateY(0deg)';
      case 6: return 'rotateX(180deg) rotateY(0deg)';
      default: return 'rotateX(0deg) rotateY(0deg)';
    }
  };

  const renderDice = (roll, label) => {
    const isWinner = false; // We can style winner differently later

    return (
      <div style={S.diceContainer}>
        <div style={S.diceLabel}>{label}</div>
        <div className={`dice-cube ${rolling ? 'rolling' : ''}`} style={{ transform: getTransform(roll) }}>
          <div className="dice-face front"><DotCount count={1} /></div>
          <div className="dice-face back"><DotCount count={6} /></div>
          <div className="dice-face right"><DotCount count={4} /></div>
          <div className="dice-face left"><DotCount count={3} /></div>
          <div className="dice-face top"><DotCount count={5} /></div>
          <div className="dice-face bottom"><DotCount count={2} /></div>
        </div>
        {showResult && <div style={S.resultBadge}>x{roll} Multiplier</div>}
      </div>
    );
  };

  return (
    <div style={S.overlay}>
      <style>{`
        .dice-cube {
          position: relative;
          width: 80px;
          height: 80px;
          transform-style: preserve-3d;
          transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .rolling {
          animation: spinDice 0.6s infinite linear;
        }
        @keyframes spinDice {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          100% { transform: rotateX(360deg) rotateY(720deg) rotateZ(360deg); }
        }
        .dice-face {
          position: absolute;
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #fff, #f0f0f0);
          border: 2px solid #ccc;
          border-radius: 12px;
          box-shadow: inset 0 0 10px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .front  { transform: rotateY(0deg) translateZ(40px); }
        .back   { transform: rotateX(180deg) translateZ(40px); }
        .right  { transform: rotateY(90deg) translateZ(40px); }
        .left   { transform: rotateY(-90deg) translateZ(40px); }
        .top    { transform: rotateX(90deg) translateZ(40px); }
        .bottom { transform: rotateX(-90deg) translateZ(40px); }

        .dice-dot {
          background: #333;
          border-radius: 50%;
          width: 14px;
          height: 14px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
        }
        .dice-grid {
          display: grid;
          width: 100%;
          height: 100%;
          padding: 12px;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          justify-items: center;
          align-items: center;
        }
        .dice-grid-1 .dice-dot:nth-child(1) { grid-area: 2 / 2; }
        
        .dice-grid-2 .dice-dot:nth-child(1) { grid-area: 1 / 1; }
        .dice-grid-2 .dice-dot:nth-child(2) { grid-area: 3 / 3; }
        
        .dice-grid-3 .dice-dot:nth-child(1) { grid-area: 1 / 1; }
        .dice-grid-3 .dice-dot:nth-child(2) { grid-area: 2 / 2; }
        .dice-grid-3 .dice-dot:nth-child(3) { grid-area: 3 / 3; }
        
        .dice-grid-4 .dice-dot:nth-child(1) { grid-area: 1 / 1; }
        .dice-grid-4 .dice-dot:nth-child(2) { grid-area: 1 / 3; }
        .dice-grid-4 .dice-dot:nth-child(3) { grid-area: 3 / 1; }
        .dice-grid-4 .dice-dot:nth-child(4) { grid-area: 3 / 3; }
        
        .dice-grid-5 .dice-dot:nth-child(1) { grid-area: 1 / 1; }
        .dice-grid-5 .dice-dot:nth-child(2) { grid-area: 1 / 3; }
        .dice-grid-5 .dice-dot:nth-child(3) { grid-area: 2 / 2; }
        .dice-grid-5 .dice-dot:nth-child(4) { grid-area: 3 / 1; }
        .dice-grid-5 .dice-dot:nth-child(5) { grid-area: 3 / 3; }
        
        .dice-grid-6 .dice-dot:nth-child(1) { grid-area: 1 / 1; }
        .dice-grid-6 .dice-dot:nth-child(2) { grid-area: 2 / 1; }
        .dice-grid-6 .dice-dot:nth-child(3) { grid-area: 3 / 1; }
        .dice-grid-6 .dice-dot:nth-child(4) { grid-area: 1 / 3; }
        .dice-grid-6 .dice-dot:nth-child(5) { grid-area: 2 / 3; }
        .dice-grid-6 .dice-dot:nth-child(6) { grid-area: 3 / 3; }
      `}</style>
      
      <div style={S.title}>Saldırı Hesaplanıyor...</div>
      
      <div style={S.diceArena}>
        {renderDice(attackerRoll, `Saldıran:\n${attackerName}`)}
        <div style={S.vs}>VS</div>
        {renderDice(defenderRoll, `Savunan:\n${defenderName}`)}
      </div>
    </div>
  );
};

const DotCount = ({ count }) => {
  const dots = Array.from({ length: count });
  return (
    <div className={`dice-grid dice-grid-${count}`}>
      {dots.map((_, i) => <div key={i} className="dice-dot" />)}
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 5, 15, 0.85)',
    backdropFilter: 'blur(8px)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontFamily: 'Arial, sans-serif'
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    marginBottom: 40,
    color: '#00d2ff',
    textShadow: '0 0 10px rgba(0, 210, 255, 0.5)',
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  diceArena: {
    display: 'flex',
    alignItems: 'center',
    gap: 60
  },
  diceContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20
  },
  diceLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    textAlign: 'center',
    whiteSpace: 'pre-line',
    background: 'rgba(255, 255, 255, 0.1)',
    padding: '6px 16px',
    borderRadius: 8,
    border: '1px solid rgba(255, 255, 255, 0.2)'
  },
  vs: {
    fontSize: 32,
    fontWeight: 900,
    color: '#ff4d4f',
    textShadow: '0 0 15px rgba(255, 77, 79, 0.6)'
  },
  resultBadge: {
    marginTop: 10,
    background: 'linear-gradient(135deg, #00d2ff, #3a7bd5)',
    padding: '4px 12px',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    boxShadow: '0 4px 10px rgba(0, 210, 255, 0.4)',
    animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  }
};

export default DiceOverlay;
