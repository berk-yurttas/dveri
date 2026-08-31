import React from 'react';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();

  // VS Player butonuna tıklayınca /match'e,
  // VS Computer butonuna tıklayınca /game'e yönlendiriyoruz.
  const goToPlayer = () => {
    navigate('/match');
  };

  const goToComputer = () => {
    navigate('/game');
  };

  return (
    <>
      <div className="home-container">
        <h1 className="title">OYUN MODUNU SEÇİN</h1>
        
        <div className="mode-buttons">
          <div className="mode-button" onClick={goToPlayer}>
            <div className="icon player-icon" />
            <span>OYUNCUYA KARŞI</span>
          </div>

          <div className="mode-button" onClick={goToComputer}>
            <div className="icon computer-icon" />
            <span>BİLGİSAYARA KARŞI</span>
          </div>
        </div>

      </div>

      <style>{`
        /* Sıfırlama */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html, body, #root {
          width: 100%;
          height: 100%;
          font-family: Arial, sans-serif;
        }

        /* Ana kapsayıcı (arka plan + içerik ortalama) */
        .home-container {
          background: #0B173B; /* Koyu mavi arka plan */
          width: 100%;
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fff;
        }

        /* Başlık */
        .title {
          font-size: 48px;
          color: #69c6ff;
          text-shadow: 0 0 10px #69c6ff; /* Hafif neon etkisi */
          margin-bottom: 50px;
        }

        /* Butonları kapsayan alan */
        .mode-buttons {
          display: flex;
          gap: 60px; /* Butonlar arası boşluk */
        }

        /* Her bir mod butonu (VS PLAYER, VS COMPUTER) */
        .mode-button {
          width: 220px;
          height: 220px;
          background: #1f3b73;
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 
            0 0 12px #0ff,         /* Dışa doğru neon gölge */
            inset 0 0 15px #0ff;   /* İç kısımda neon gölge */
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .mode-button:hover {
          transform: scale(1.05);
          box-shadow:
            0 0 20px #0ff,
            inset 0 0 20px #0ff;
        }
        .mode-button span {
          margin-top: 15px;
          font-size: 20px;
          font-weight: bold;
          color: #69c6ff;
          text-shadow: 0 0 5px #69c6ff;
        }

        /* Icon placeholder (örnek SVG ya da emoji kullanabilirsiniz) */
        .icon {
          width: 60px;
          height: 60px;
          background-size: cover;
          background-position: center;
        }
        /* İnsan ikonu (örnek) */
        .player-icon {
          background-image: url("data:image/svg+xml,%3Csvg fill='%23fff' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm8 2c-1.48 0-4.5.74-4.5 2.22V18h9v-2.78C20.5 13.74 17.48 13 16 13zM8 13c-1.48 0-4.5.74-4.5 2.22V18h9v-2.78C12.5 13.74 9.48 13 8 13z'/%3E%3Cpath d='M0 0h24v24H0z' fill='none'/%3E%3C/svg%3E");
        }
        /* Bilgisayar ikonu (örnek) */
        .computer-icon {
          background-image: url("data:image/svg+xml,%3Csvg fill='%23fff' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M21 3H3c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h7l-2 3h8l-2-3h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H3V5h18v11z'/%3E%3Cpath d='M0 0h24v24H0z' fill='none'/%3E%3C/svg%3E");
        }

        /* Çıkış Yap butonu */
        .logout-button {
          margin-top: 50px;
          background: #ff5757;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        }
        .logout-button:hover {
          background: #ff1c1c;
        }
      `}</style>
    </>
  );
};

export default Home;
