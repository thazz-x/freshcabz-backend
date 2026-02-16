const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { createNotification } = require('../utils/notificationHelper');

// --- 1. ROTA DE ESTATÍSTICAS (DASHBOARD) ---
// Deve vir ANTES das rotas com :id para evitar conflitos de rota
router.get('/stats', auth, async (req, res) => {
    // Segurança: Apenas Admin pode ver faturamento
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied.' });
    }

    try {
        // Query otimizada: Faz todos os cálculos no banco (mais rápido e seguro)
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN booking_date = CURRENT_DATE THEN CAST(final_price AS DECIMAL) ELSE 0 END), 0) as today,
                COALESCE(SUM(CASE WHEN booking_date >= date_trunc('week', CURRENT_DATE)::date THEN CAST(final_price AS DECIMAL) ELSE 0 END), 0) as week,
                COALESCE(SUM(CASE WHEN booking_date >= date_trunc('month', CURRENT_DATE)::date THEN CAST(final_price AS DECIMAL) ELSE 0 END), 0) as month,
                COUNT(*) FILTER (WHERE status = 'completed') as total_completed_count
            FROM bookings 
            WHERE status = 'completed'
        `;

        const result = await pool.query(query);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error in GET /stats:", err.message);
        res.status(500).send('Server Error');
    }
});

// --- 2. BUSCAR AGENDAMENTOS (LISTAGEM) ---
router.get('/', auth, async (req, res) => {
    try {
        let query;
        let params = [];

        if (req.user.role === 'admin') {
            // Admin vê tudo. Ordenado por ID decrescente (mais novos primeiro)
            query = `
                SELECT b.*, s.name as service_name, u.name as client_name, u.phone as client_phone 
                FROM bookings b 
                LEFT JOIN services s ON b.service_id = s.id 
                LEFT JOIN users u ON b.client_id = u.id 
                ORDER BY b.id DESC`;
        } else {
            // Cliente vê apenas os seus
            query = `
                SELECT b.*, s.name as service_name 
                FROM bookings b 
                LEFT JOIN services s ON b.service_id = s.id 
                WHERE b.client_id = $1 
                ORDER BY b.booking_date DESC`;
            params = [req.user.id];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error in GET /booking:", err.message);
        res.status(500).send('Server Error');
    }
});

// --- 3. CRIAR AGENDAMENTO ---
router.post('/', auth, async (req, res) => {
    const { 
        service_id, booking_date, booking_time, address, 
        car_size, latitude, longitude 
    } = req.body;
   
    try {
        // Segurança: Busca o preço no servidor, não confia no frontend
        const priceQuery = await pool.query(
            'SELECT price FROM service_prices WHERE service_id = $1 AND vehicle_size = $2',
            [service_id, car_size]
        );

        if (priceQuery.rows.length === 0) {
            return res.status(400).json({ msg: "Price not found for this configuration." });
        }

        const realPrice = priceQuery.rows[0].price;
    
        const result = await pool.query(
            `INSERT INTO bookings 
            (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, realPrice, latitude, longitude]
        );

        // Envia notificação para o Admin (ou para o próprio user confirmando)
        await createNotification(
            req.user.id, 
            "Booking Received ✅", 
            `We received your request for ${booking_date}. Waiting for approval.`
        );

        res.status(201).json({ msg: "Booking created successfully!", booking: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- 4. ATUALIZAR STATUS (ADMIN) ---
router.put('/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied.' });
    }

    const validStatus = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatus.includes(status)) {
        return res.status(400).json({ msg: 'Invalid status' });
    }

    try {
        const result = await pool.query(
            "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *",
            [status, bookingId]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Booking not found' });
        
        const booking = result.rows[0];

        // Notificações Inteligentes
        let title = "";
        let body = "";
        if (status === 'confirmed') {
            title = "Booking Confirmed! ✅";
            body = `Your service for ${booking.booking_date} is confirmed.`;
        } else if (status === 'completed') {
            title = "Service Completed! ✨";
            body = "Your car is fresh! Thank you for choosing FreshCabz.";
        }

        if (title) await createNotification(booking.client_id, title, body);

        res.json({ msg: `Status updated to ${status}`, booking });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- 5. DETAILER ACEITA TRABALHO ---
router.put('/accept/:id', auth, async (req, res) => {
    if (req.user.role !== 'detailer') return res.status(403).json({ msg: 'Access denied.' });
    
    try {
        // Verifica se ainda está pendente antes de aceitar
        const check = await pool.query("SELECT status FROM bookings WHERE id = $1", [req.params.id]);
        if (check.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        if (check.rows[0].status !== 'pending') return res.status(400).json({ msg: 'Job already taken.' });

        const update = await pool.query(
            "UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *",
            [req.user.id, req.params.id]
        );

        res.json({ msg: "Job accepted!", booking: update.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

// --- 6. CANCELAR ---
router.put('/cancel/:id', auth, async (req, res) => {
    try {
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
        res.json({ msg: "Cancelled successfully" });
    } catch (err) { res.status(500).send('Server Error'); }
});

// --- ROTAS AUXILIARES ---
router.get('/history', auth, async (req, res) => {
    const userId = req.user.id;
    try {
        const query = req.user.role === 'client' 
            ? 'SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON b.service_id = s.id WHERE b.client_id = $1 ORDER BY b.booking_date DESC'
            : 'SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON b.service_id = s.id WHERE b.detailer_id = $1 ORDER BY b.booking_date ASC';
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch(err) { res.status(500).send('Server Error'); }
});

router.get('/availability', async (req, res) => {
    try {
        const result = await pool.query("SELECT booking_time FROM bookings WHERE booking_date = $1 AND status != 'cancelled'", [req.query.date]);
        res.json(result.rows.map(row => row.booking_time));
    } catch(err) { res.status(500).send('Server Error'); }
});

module.exports = router;