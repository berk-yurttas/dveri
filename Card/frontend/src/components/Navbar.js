// src/components/Navbar.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const odakUrl = process.env.REACT_APP_ODAK_URL || 'http://localhost:3000';

  return (
    <nav className="navbar">
      <div className="nav-left">
      <Link to="/home" className="logo-link">
          <h2 className="nav-logo">ASELSAN Kalkan Oyunu</h2>
        </Link>
      </div>
      <div className="nav-right">
        <ul className="nav-menu">
          <li>
            <Link to="/game">Bilgisayara Karşı Oyuna Başla</Link>
          </li>
          <li>
            <Link to="/match">Birebir Oyuna Başla</Link>
          </li>
        </ul>
        <a href={odakUrl} className="odak-btn">ODAK&apos;a Dön</a>
      </div>
    </nav>
  );
};

export default Navbar;
