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

// [NOVA ROTA] 3. LISTA DE CLIENTES + TOTAL GASTO (Usada na Página Clients)
router.get('/clients', auth, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Admins only.' });
    }

    try {
        // Query Blindada: Soma apenas serviços 'completed' e limpa o texto do preço
        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.phone, 
                u.role,
                COUNT(b.id) FILTER (WHERE b.status = 'completed') as total_services,
                COALESCE(SUM(CASE 
                    WHEN b.status = 'completed' 
                    THEN NULLIF(regexp_replace(b.final_price::text, '[^0-9.]', '', 'g'), '')::numeric 
                    ELSE 0 
                END), 0) as total_spent
            FROM users u
            LEFT JOIN bookings b ON u.id = b.client_id
            WHERE u.role = 'client'
            GROUP BY u.id
            ORDER BY total_spent DESC
        `;

        const result = await pool.query(query);
        res.json(result.rows);

    } catch (err) {
        console.error("Erro na rota /clients:", err.message);
        res.status(500).send('Server Error');
    }
});

// 4. LIST ALL USERS (Genérico - Mantido para compatibilidade)
router.get('/', auth, async (req, res) => {
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

// 5. CHANGE USER ROLE (Promover/Rebaixar)
router.put('/role/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });

    const { newRole } = req.body; 
    const userId = req.params.id;

    try {
        await pool.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, userId]);
        res.json({ msg: `User role updated to ${newRole}` });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 6. DELETE USER (Banir)
router.delete('/:id', auth, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });

    const userId = req.params.id;

    try {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        res.json({ msg: 'User deleted successfully' });
    } catch (err) {
        // Se falhar (por ter agendamentos), avisa o front
        res.status(500).json({ msg: 'Cannot delete user with active bookings.' });
    }
});

router.delete('/me', auth, async (req, res) => {
    try {
        // Deleta o usuário (o banco de dados deve ter CASCADE nas foreign keys 
        // para deletar os bookings dele também, ou você pode atualizar o status dos bookings).
        await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
        
        res.json({ msg: "Account successfully deleted" });
    } catch (err) {
        console.error("Error deleting account:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;