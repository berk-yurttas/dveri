const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const usersRepository = require('../repositories/usersRepository');
const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const userExists = await usersRepository.findByEmail(email);
    if (userExists) return res.status(400).json({ message: 'Email zaten kullanılıyor' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await usersRepository.createUser({ username, email, password: hashedPassword });

    res.status(201).json({ message: 'Kayıt başarılı' });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await usersRepository.findByEmail(email);
    if (!user) return res.status(400).json({ message: 'Geçersiz kimlik bilgileri' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Geçersiz kimlik bilgileri' });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set. Copy backend/.env.example to backend/.env and set JWT_SECRET.');
      return res.status(500).json({ message: 'Sunucu yapılandırma hatası' });
    }
    const token = jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '1h' });
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ message: 'Sunucu hatası' });
  }
});

module.exports = router;
