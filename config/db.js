// config/db.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Erro ao adquirir cliente do banco de dados:', err.stack);
    }
    console.log('Conexão com PostgreSQL estabelecida com sucesso.');
    release(); // Libera o cliente de volta ao pool
});

module.exports = pool;