// src/contexts/AuthContext.js
import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // Login/register akışını bypass etmek için varsayılan yerel oturum kullan.
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem('token');
    if (stored) return stored;
    const fallback = 'odak-session';
    localStorage.setItem('token', fallback);
    return fallback;
  });

  const login = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  // Farklı sekmelerden yapılan değişiklikleri yakalamak için
  /*
  useEffect(() => {
    const handleStorageChange = () => {
      setToken(localStorage.getItem('token'));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
  */
  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};
