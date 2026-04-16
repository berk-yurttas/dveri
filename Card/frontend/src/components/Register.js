import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../config';

const Register = () => {
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  localStorage.clear();

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/api/auth/register`, formData);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Kayıt başarısız');
    }
  };

  return (
    <>
      <div className="register-wrapper">
        {/* Wave background */}
        <div className="wave-bg">
          <svg className="wave wave1" viewBox="0 0 500 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: '#6699ff' }} />
                <stop offset="100%" style={{ stopColor: '#88bbff' }} />
              </linearGradient>
            </defs>
            <path
              d="M0,50 C150,150 350,0 500,100 L500,0 L0,0 Z"
              fill="url(#waveGradient)"
            />
          </svg>

          <svg className="wave wave2" viewBox="0 0 500 150" preserveAspectRatio="none">
            <path
              d="M0,80 C200,80 300,0 500,40 L500,0 L0,0 Z"
              fill="#88bbff"
              opacity="0.7"
            />
          </svg>
        </div>

        {/* Register Card */}
        <div className="register-card">
          <h2>Kayıt Ol</h2>
          {error && <p className="error">{error}</p>}
          <form onSubmit={onSubmit}>
            <input
              type="text"
              name="username"
              placeholder="Kullanıcı Adı"
              value={formData.username}
              onChange={onChange}
              required
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={onChange}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Şifre"
              value={formData.password}
              onChange={onChange}
              required
            />
            <button type="submit">Kayıt Ol</button>
          </form>
          <p className="already">
            Zaten hesabın var mı? <Link to="/login">Giriş Yap</Link>
          </p>
        </div>
      </div>

      {/* Inline styles */}
      <style>{`
        /* Reset */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        html, body, #root {
          width: 100%;
          height: 100%;
          font-family: Arial, sans-serif;
          background: #fff;
        }

        /* Main wrapper */
        .register-wrapper {
          position: relative;
          width: 100%;
          height: 100vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Wave background */
        .wave-bg {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 250px;
          overflow: hidden;
        }
        .wave {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        .wave2 {
          top: 40px;
        }

        /* Register card styling */
        .register-card {
          position: relative;
          background: #fff;
          width: 420px;
          padding: 50px 40px;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          border: 2px solid #f7f7f7;
          z-index: 1;
          text-align: center;
        }
        .register-card h2 {
          margin-bottom: 25px;
          color: #333;
          font-size: 24px;
        }
        .register-card .error {
          color: red;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .register-card form {
          display: flex;
          flex-direction: column;
        }
        .register-card input {
          margin: 10px 0;
          padding: 12px;
          font-size: 14px;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .register-card button {
          margin-top: 20px;
          padding: 14px;
          background: #007bff;
          color: #fff;
          border: none;
          border-radius: 4px;
          font-size: 16px;
          cursor: pointer;
        }
        .register-card button:hover {
          background: #0056b3;
        }
        .already {
          margin-top: 20px;
          font-size: 14px;
          color: #666;
        }
        .already a {
          color: #007bff;
          text-decoration: none;
        }
        .already a:hover {
          text-decoration: underline;
        }
      `}</style>
    </>
  );
};

export default Register;
