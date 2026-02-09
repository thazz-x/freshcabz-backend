const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit'); // <--- 1. Importação da proteção
const saltRounds = 10;

// --- 🛡️ CONFIGURAÇÃO DO LIMITADOR (BRUTE FORCE) ---
// Isso impede que alguém tente adivinhar a senha milhares de vezes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos de bloqueio
    max: 5, // Bloqueia após 5 tentativas erradas
    message: { msg: "Too many login attempts from this IP, please try again after 15 minutes." },
    standardHeaders: true, 
    legacyHeaders: false,
});

// 1. SIGNUP (Cadastro)
router.post('/signup', async (req, res) => {
  const { name, email, password, phone } = req.body;

  // --- 👮‍♂️ SECURITY & VALIDATION ZONE ---
  
  // Check empty fields
  if (!name || !email || !password || !phone) {
      return res.status(400).json({ msg: 'Please fill in all fields.' });
  }

  // Validate Email Format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
      return res.status(400).json({ msg: 'Invalid email address.' });
  }

  // Validate Phone (Only numbers, 8-15 digits)
  const phoneRegex = /^[0-9]{8,15}$/;
  if (!phoneRegex.test(phone)) {
      return res.status(400).json({ msg: 'Phone must contain only numbers (8-15 digits).' });
  }

  // Validate Lengths
  if (name.length > 100) {
      return res.status(400).json({ msg: 'Name is too long (max 100 chars).' });
  }
  if (password.length < 6) {
      return res.status(400).json({ msg: 'Password must be at least 6 characters.' });
  }

  // --- END VALIDATION ---

  try {
    // Check if user exists
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ msg: 'User already exists.' });
    }

    // Hash Password
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert User
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, role',
      [name, email, hashedPassword, phone, 'client']
    );

    const user = newUser.rows[0];

    // Generate Token
    const payload = { user: { id: user.id, role: user.role } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5d' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({ 
            msg: 'Registration successful!', 
            token, 
            user: user 
        });
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. LOGIN (Com Rate Limiter 🛡️)
// Adicionamos 'loginLimiter' aqui antes do async para proteger a rota
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check Email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ msg: 'Invalid credentials.' }); 
    }

    const user = userResult.rows[0];

    // Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: 'Invalid credentials.' });
    }

    // Generate Token
    const payload = { user: { id: user.id, role: user.role } };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5d' },
      (err, token) => {
        if (err) throw err;
        
        // Return Token + User Data (including phone for Profile)
        res.json({ 
            token,
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email,
                role: user.role,
                phone: user.phone 
            } 
        });
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;