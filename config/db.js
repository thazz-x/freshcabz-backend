// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

// Verifica se existe a URL do banco (Sinal que estamos na Nuvem ou temos o link completo)
const isProduction = !!process.env.DATABASE_URL;

let poolConfig;

if (isProduction) {
    // ☁️ CONFIGURAÇÃO PARA O RENDER (Nuvem)
    poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    };
} else {
    // 💻 CONFIGURAÇÃO PARA O MAC (Local)
    poolConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        ssl: false // Importante: Desliga o SSL no local
    };
}

const pool = new Pool(poolConfig);

pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Erro ao conectar no Banco:', err.message);
    }
    console.log(isProduction ? '✅ Conectado no Render (Nuvem)' : '✅ Conectado no Mac (Local)');
    release();
});

module.exports = pool;