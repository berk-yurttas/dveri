// src/App.js
import React, { useContext } from 'react';
import { useLocation, BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Login from './components/Login';
import Register from './components/Register';
import Home from './components/Home';
import Game from './components/Game';
import MatchScreen from './components/MatchScreen';
import BackgroundMusic from './components/MusicPlayer';
import { API_BASE } from './config';

function AppRoutes() {

  const location = useLocation();
  // AuthContext'ten isAuthenticated bilgisini alıyoruz
  const { isAuthenticated } = useContext(AuthContext);

  return (
    <>
      {isAuthenticated && location.pathname !== "/" && <Navbar />}
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/home" element={isAuthenticated ? <Home /> : <Navigate to="/login" />} />
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/home" />} />
        <Route path="/register" element={<Register />} />
        <Route path="/game" element={isAuthenticated ? <Game /> : <Navigate to="/login" />} />
        <Route path="/match" element={isAuthenticated ? <MatchScreen /> : <Navigate to="/login" />} />
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
    <AuthProvider>
      <Router>
      <BackgroundMusic playlist={playlist} />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
