// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  // Em vez de user, host, password separados, usamos a String única
  // Lembre-se: No Render, nós já configuramos essa variável DATABASE_URL nas settings
  connectionString: process.env.DATABASE_URL, 
  
  // AQUI ESTÁ A CORREÇÃO DE SEGURANÇA (O "Carro Forte")
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Erro ao conectar no Banco:', err.stack);
    }
    console.log('✅ Conexão com PostgreSQL estabelecida com sucesso!');
    release(); // Libera o cliente de volta ao pool
});

module.exports = pool;