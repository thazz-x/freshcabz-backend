const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// ==========================================
// 👤 SEÇÃO DE PERFIL (Para todos os usuários)
// ==========================================

// 1. GET PROFILE (Ver meus próprios dados)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE id = $1', 
      [req.user.id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ msg: 'User not found.' });
    }
    res.json(user.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. UPDATE PROFILE (Atualizar meus dados)
router.put('/update', auth, async (req, res) => {
  const { name, phone, email } = req.body;

  if (!name || !email || !phone) {
      return res.status(400).json({ msg: 'Please fill in all fields.' });
  }

  try {
    // Evita que eu mude meu email para um que já existe em outra conta
    const emailCheck = await pool.query(
        'SELECT * FROM users WHERE email = $1 AND id != $2',
        [email, req.user.id]
    );

    if (emailCheck.rows.length > 0) {
        return res.status(400).json({ msg: 'This email is already in use.' });
    }

    const updateUser = await pool.query(
      'UPDATE users SET name = $1, phone = $2, email = $3 WHERE id = $4 RETURNING id, name, email, phone, role',
      [name, phone, email, req.user.id]
    );

    res.json({ msg: "Profile updated!", user: updateUser.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ==========================================
// 👮 SEÇÃO ADMINISTRATIVA (Apenas para Admins)
// ==========================================

// 3. LIST ALL USERS (Opção 4 do Painel)
// Traz todos os usuários e conta quantos agendamentos cada um já fez
router.get('/', auth, async (req, res) => {
    // Bloqueio de segurança: Se não for admin, nem tenta ler o banco
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Admins only.' });
    }

    try {
        const query = `
            SELECT 
                u.id, u.name, u.email, u.phone, u.role, u.created_at,
                COUNT(b.id) as total_bookings
            FROM users u
            LEFT JOIN bookings b ON u.id = b.client_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error fetching user list');
    }
});

// 4. CHANGE USER ROLE (Promover/Rebaixar usuário)
// Útil para transformar um Cliente em Detailer no sistema
router.put('/role/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });

    const { newRole } = req.body; // 'client', 'detailer' ou 'admin'
    const userId = req.params.id;

    try {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, userId]);
        res.json({ msg: `User role updated to ${newRole}` });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 5. DELETE USER (Banir usuário do sistema)
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });

    const userId = req.params.id;

    try {
        // Nota: Isso pode falhar se o usuário tiver agendamentos (Foreign Key Constraint)
        // Por segurança, no futuro podemos usar "soft delete" (desativar a conta)
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ msg: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ msg: 'Cannot delete user with active bookings.' });
    }
});

module.exports = router;