const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth'); // Middleware de segurança

// 1. GET PROFILE (GET /api/user/me)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE id = $1', 
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found.' }); // Traduzido
    }

    res.json(user.rows[0]);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. UPDATE PROFILE (PUT /api/user/update)
router.put('/update', auth, async (req, res) => {
  const { name, phone, email } = req.body;

  // --- 👮‍♂️ ZONA DE VALIDAÇÃO (SECURITY) ---
  
  // 1. Checa se enviou tudo
  if (!name || !email || !phone) {
      return res.status(400).json({ msg: 'Please fill in all fields.' });
  }

  // 2. Validação com Regex (Padrões)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9]{8,15}$/;

  if (!emailRegex.test(email)) return res.status(400).json({ msg: 'Invalid email address.' });
  if (!phoneRegex.test(phone)) return res.status(400).json({ msg: 'Invalid phone number (only digits allowed).' });
  if (name.length > 100) return res.status(400).json({ msg: 'Name is too long.' });

  // --- FIM DA VALIDAÇÃO ---

  try {
    // 🔍 CHECK EMAIL COLLISION (Evita erro 500 no banco)
    // Tradução: "Procure alguém que tenha esse email NOVO, mas que NÃO seja eu."
    const emailCheck = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, req.user.id]
    );

    if (emailCheck.rows.length > 0) {
        return res.status(400).json({ msg: 'This email is already in use by another user.' });
    }

    // Se passou, atualiza!
    const updateUser = await pool.query(
      'UPDATE users SET name = $1, phone = $2, email = $3 WHERE id = $4 RETURNING id, name, email, phone, role',
      [name, phone, email, req.user.id]
    );

    if (updateUser.rows.length === 0) {
        return res.status(404).json({ msg: "User not found." });
    }

    res.json({
      msg: "Profile updated successfully!",
      user: updateUser.rows[0]
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error updating profile.');
  }
});

module.exports = router;