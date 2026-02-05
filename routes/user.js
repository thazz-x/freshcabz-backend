const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth'); // Middleware de segurança

// 1. Rota para PEGAR dados do usuário (GET /api/user/me)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE id = $1', 
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'Usuário não encontrado.' });
    }

    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// 2. Rota para ATUALIZAR dados (PUT /api/user/update)
router.put('/update', auth, async (req, res) => {
  const { name, phone, email } = req.body;

  try {
    // Atualiza nome, telefone e email
    const updateUser = await pool.query(
      'UPDATE users SET name = $1, phone = $2, email = $3 WHERE id = $4 RETURNING id, name, email, phone, role',
      [name, phone, email, req.user.id]
    );

    if (updateUser.rows.length === 0) {
        return res.status(404).json({ msg: "Usuário não encontrado." });
    }

    res.json({
      msg: "Profile updated successfully!",
      user: updateUser.rows[0]
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro ao atualizar perfil.');
  }
});

module.exports = router;