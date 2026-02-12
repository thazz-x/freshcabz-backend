const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET /api/services (Mantive sua query profissional)
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
                        'vehicle_size', sp.vehicle_size, 
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

// PUT /api/services/:id (A NOVA ROTA DE EDIÇÃO COMPLETA)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, tag, features, prices } = req.body;

    // features vem do frontend como um Array de strings ["Lavar roda", "Cera", ...]

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Começa a transação segura

        // 1. Montar o novo JSON (Mantendo a estrutura que o App iOS já usa)
        const newDetailsJson = {
            tag: tag || "", // Ex: "BEST SELLER"
            exterior: features || [] // A lista de itens
        };

        // 2. Atualizar a tabela Pai (services)
        await client.query(
            `UPDATE services 
             SET name = $1, description = $2, details_json = $3 
             WHERE id = $4`,
            [name, description, newDetailsJson, id]
        );

        // 3. Atualizar os Preços (service_prices)
        // Loopamos pelos preços enviados e atualizamos um por um
        if (prices && prices.length > 0) {
            for (const p of prices) {
                await client.query(
                    `UPDATE service_prices 
                     SET price = $1 
                     WHERE service_id = $2 AND vehicle_size = $3`,
                    [p.price, id, p.vehicle_size]
                );
            }
        }

        await client.query('COMMIT'); // Salva tudo
        res.json({ message: "Service updated successfully!" });

    } catch (err) {
        await client.query('ROLLBACK'); // Se der erro, cancela tudo
        console.error("Erro ao atualizar serviço:", err.message);
        res.status(500).send('Server Error');
    } finally {
        client.release();
    }
});

module.exports = router;