const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Certifique-se que o caminho do seu banco está correto

// Rota para salvar ou atualizar a capacidade de um dia (UPSERT)
router.post('/capacity', async (req, res) => {
    const { date, total_detailers } = req.body;

    try {
        const query = `
            INSERT INTO daily_capacity (work_date, total_detailers)
            VALUES ($1, $2)
            ON CONFLICT (work_date) 
            DO UPDATE SET total_detailers = EXCLUDED.total_detailers
            RETURNING *;
        `;
        const result = await pool.query(query, [date, total_detailers]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Erro ao salvar capacidade:", err);
        res.status(500).json({ error: "Erro no servidor" });
    }
});

// Rota para buscar as capacidades definidas (usado no painel Admin)
router.get('/capacity', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM daily_capacity WHERE work_date >= CURRENT_DATE ORDER BY work_date ASC LIMIT 30"
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar histórico" });
    }
});

module.exports = router;