// routes/auth.js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const saltRounds = 10;

// Rota de Cadastro (POST /api/auth/signup)
router.post('/signup', async (req, res) => {
  const { name, email, password, phone } = req.body;

  try {
    // 1. Verificar se o usuário já existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ msg: 'Usuário com este e-mail já existe.' });
    }

    // 2. Hash da Senha
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 3. Inserir novo usuário no BD
    // CORREÇÃO 1: Adicionei 'role' no RETURNING para o iOS não crashar
    const newUser = await pool.query(
      'INSERT INTO users (name, email, password, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, phone, role',
      [name, email, hashedPassword, phone, 'client'] // Forçamos 'client' na criação
    );

    const user = newUser.rows[0];

    // CORREÇÃO 2: Gerar o Token JWT IMEDIATAMENTE após criar a conta
    // Isso permite que o usuário já entre logado!
    const payload = { 
        user: { 
            id: user.id,
            role: user.role 
        } 
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5d' },
      (err, token) => {
        if (err) throw err;
        
        // 4. Enviar a resposta IGUAL à do Login (Token + User completo)
        res.status(201).json({ 
            msg: 'Cadastro realizado com sucesso!', 
            token, // <--- O iOS precisa disso para logar
            user: user // <--- Agora inclui o 'role' que o iOS exige
        });
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

// Rota de Login (POST /api/auth/login)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Procurar o usuário pelo email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ msg: 'Credenciais inválidas.' }); 
    }

    const user = userResult.rows[0];

    // 2. Comparar a senha
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ msg: 'Credenciais inválidas.' });
    }

    // 3. Gerar o JSON Web Token (JWT)
    const payload = { 
        user: { 
            id: user.id,
            role: user.role
        } 
    };

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '5d' },
      (err, token) => {
        if (err) throw err;
        
        res.json({ 
            token,
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email,
                role: user.role
            } 
        });
      }
    );

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
});

module.exports = router;