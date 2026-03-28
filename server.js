// server.js

// 1. Carregar variáveis de ambiente
require('dotenv').config();

// 2. Imports
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors'); // Importante para o Render aceitar conexões externas

// 3. Conexão com o banco
require('./config/db');

// 4. Rotas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const serviceRoutes = require('./routes/services');
const bookingRoutes = require('./routes/booking');
const adminRoutes = require('./routes/admin');

// 5. App
const app = express();

// 6. Middlewares
app.use(cors()); // Libera o acesso para o seu App iOS e Web
app.use(bodyParser.json());

// 7. Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/upload', require('./routes/upload'));
app.use('/admin', adminRoutes);

// Rota de teste simples para saber se o servidor está vivo
app.get('/', (req, res) => {
  res.send('FreshCabz Backend Rodando na Nuvem! 🚀');
});

// 8. Servidor (Configuração correta para Render)
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor FreshCabz rodando na porta ${PORT}`);
});