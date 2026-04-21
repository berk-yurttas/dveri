// src/App.js
import React from 'react';
import { useLocation, BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './components/Home';
import Game from './components/Game';
import MatchScreen from './components/MatchScreen';
import BackgroundMusic from './components/MusicPlayer';
import { API_BASE } from './config';

function AppRoutes() {

  const location = useLocation();

  return (
    <>
      {location.pathname !== "/" && <Navbar />}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<Home />} />
        <Route path="/login" element={<Navigate to="/home" replace />} />
        <Route path="/register" element={<Navigate to="/home" replace />} />
        <Route path="/game" element={<Game />} />
        <Route path="/match" element={<MatchScreen />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </>
  );
}

function App() {
  const localMusicFiles = [
    '44.2-Hücûm Marşı [1080p].mp3',
    'Er Turan - Türk Kanı (Türkçe Altyazılı) Full HD _ Cengizhan - Kazakistan Halk Müziği.mp3',
    'Star Wars Jedi Temple March.mp3',
    'Turkish Patriotic Song _Ankara March_.mp3',
    'Turkish Patriotic Song _Ankara March_ (1).mp3',
    'Voodoodoodoo.mp3',
  ];
  const playlist = localMusicFiles.map(
    (fileName) => `${API_BASE}/music/${encodeURIComponent(fileName)}`
  );
  return (
    <Router>
      <BackgroundMusic playlist={playlist} />
        <AppRoutes />
    </Router>
  );
}

export default App;
