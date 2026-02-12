const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// --- 1. LISTAR SERVIÇOS (GET) ---
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
                        'size', sp.vehicle_size, 
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
            WHERE s.is_active = true  -- 💡 SÓ MOSTRA OS ATIVOS
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

// --- 2. CRIAR NOVO SERVIÇO (POST) ---
router.post('/', async (req, res) => {
    const { name, description } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Cria serviço ativo
        const serviceRes = await client.query(
            `INSERT INTO services (name, description, duration_minutes, is_active, details_json) 
             VALUES ($1, $2, 60, true, '{"tag":"", "exterior":[], "interior":[]}') 
             RETURNING id`,
            [name, description]
        );
        const newServiceId = serviceRes.rows[0].id;

        // Cria preços zerados
        const sizes = ['Small', 'Medium', 'Large', 'X-Large'];
        for (const size of sizes) {
            await client.query(
                `INSERT INTO service_prices (service_id, vehicle_size, price) 
                 VALUES ($1, $2, 0)`,
                [newServiceId, size]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ message: "Service created!", id: newServiceId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send('Erro ao criar serviço');
    } finally {
        client.release();
    }
});

// --- 3. ATUALIZAR SERVIÇO (PUT) ---
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description, tag, featuresExterior, featuresInterior, prices } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const newDetailsJson = {
            tag: tag || "", 
            exterior: featuresExterior || [],
            interior: featuresInterior || []
        };

        await client.query(
            `UPDATE services 
             SET name = $1, description = $2, details_json = $3 
             WHERE id = $4`,
            [name, description, newDetailsJson, id]
        );

        if (prices && prices.length > 0) {
            for (const p of prices) {
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
        console.error("Erro ao atualizar:", err.message);
        res.status(500).send('Server Error');
    } finally {
        client.release();
    }
});

// --- 4. DELETAR SERVIÇO (SOFT DELETE) ---
// Arquiva o serviço (is_active = false)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Não usamos DELETE FROM, usamos UPDATE para segurança do histórico
        await pool.query('UPDATE services SET is_active = false WHERE id = $1', [id]);
        res.json({ message: "Service archived successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Erro ao deletar serviço');
    }
});

module.exports = router;