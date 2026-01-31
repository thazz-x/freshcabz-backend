const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Mantive o seu caminho de conexão

// GET /api/services
// Agora busca direto do banco: Detalhes + Lista de Preços
router.get('/', async (req, res) => {
    try {
        // ESSA É A QUERY PROFISSIONAL:
        // 1. Pega os dados do serviço (s.*)
        // 2. Usa 'json_agg' para criar uma lista de preços dentro do próprio resultado
        const query = `
            SELECT 
                s.id, 
                s.name, 
                s.description, 
                s.duration_minutes, 
                s.details_json, 
                json_agg(
                    json_build_object(
                        'size', sp.vehicle_size, 
                        'price', sp.price
                    )
                ) as prices
            FROM services s
            JOIN service_prices sp ON s.id = sp.service_id
            WHERE s.is_active = true
            GROUP BY s.id
            ORDER BY s.id ASC;
        `;

        const result = await pool.query(query);
        
        // O banco já entrega o JSON pronto, não precisa mais daquele 'map' complicado!
        res.json(result.rows);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Erro ao buscar serviços no banco de dados');
    }
});

module.exports = router;