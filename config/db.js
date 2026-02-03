// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

// No Render, a variável DATABASE_URL é injetada automaticamente se configurada.
const connectionString = process.env.DATABASE_URL;

let poolConfig;

if (connectionString) {
    // ☁️ CONFIGURAÇÃO PARA O RENDER (Nuvem)
    poolConfig = {
        connectionString: connectionString,
        ssl: {
            rejectUnauthorized: false // Obrigatório para o SSL do Render
        },
        // Adicionando timeouts para evitar que a conexão fique "pendurada" e sem resposta no log
        connectionTimeoutMillis: 5000, 
        idleTimeoutMillis: 30000,
        max: 10
    };
} else {
    // 💻 CONFIGURAÇÃO PARA O MAC (Local)
    poolConfig = {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE,
        password: String(process.env.DB_PASSWORD), // Garante que a senha seja lida como texto
        port: process.env.DB_PORT,
        ssl: false
    };
}

const pool = new Pool(poolConfig);

// TESTE DE CONEXÃO MELHORADO
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Erro ao conectar no Banco!');
        console.error('📝 Mensagem técnica:', err.message); // Ex: "password authentication failed"
        console.error('🔑 Código do erro:', err.code);      // Ex: "ECONNREFUSED" ou "28P01"
        return;
    }
    
    console.log(connectionString ? '✅ Conectado com sucesso no Render!' : '✅ Conectado com sucesso no Mac!');
    
    // Libera o cliente de teste imediatamente
    release();
});

// Tratamento de erro em conexões ociosas (evita que o servidor caia do nada)
pool.on('error', (err) => {
    console.error('❌ Erro inesperado em um cliente ocioso:', err.message);
});

module.exports = pool;