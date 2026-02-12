const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/services
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.id, 
                s.name, 
                s.description, 
                s.duration_minutes, 
                s.details_json, 
                json_agg(
                    json_build_object(
                        'size', sp.vehicle_size,  -- 🚨 AQUI ESTAVA O ERRO! Voltei para 'size' para o iPhone ler.
                        'price', sp.price
                    ) ORDER BY 
                        CASE sp.vehicle_size 
                            WHEN 'Small' THEN 1 
                            WHEN 'Medium' THEN 2 
                            WHEN 'Large' THEN 3 
                            ELSE 4 
                        END
                ) as prices
            FROM services s
            JOIN service_prices sp ON s.id = sp.service_id
            WHERE s.is_active = true
            GROUP BY s.id
            ORDER BY s.id ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Erro ao buscar serviços');
    }
});

// PUT /api/services/:id (Atualização Segura)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, tag, features, prices } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Atualiza JSON de detalhes e informações básicas
        const newDetailsJson = {
            tag: tag || "", 
            exterior: features || [] 
        };

        await client.query(
            `UPDATE services 
             SET name = $1, description = $2, details_json = $3 
             WHERE id = $4`,
            [name, description, newDetailsJson, id]
        );

        // 2. Atualiza Preços
        // O Frontend vai mandar 'size' agora, mas o banco chama 'vehicle_size'.
        // Fizemos a conversão aqui embaixo:
        if (prices && prices.length > 0) {
            for (const p of prices) {
                // p.size vem do frontend, mas no banco a coluna é vehicle_size
                const sizeValue = p.size || p.vehicle_size; 

                await client.query(
                    `UPDATE service_prices 
                     SET price = $1 
                     WHERE service_id = $2 AND vehicle_size = $3`,
                    [p.price, id, sizeValue]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: "Service updated successfully!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Erro ao atualizar serviço:", err.message);
        res.status(500).send('Server Error');
    } finally {
        client.release();
    }
});

module.exports = router;