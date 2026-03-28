const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { createNotification } = require('../utils/notificationHelper');

// 1. BUSCAR AGENDAMENTOS (GET /)
router.get('/', auth, async (req, res) => {
    try {
        let query;
        let params = [];

        if (req.user.role === 'admin') {
            query = `
                SELECT b.*, s.name as service_name, u.name as client_name, u.phone as client_phone 
                FROM bookings b 
                LEFT JOIN services s ON b.service_id = s.id 
                LEFT JOIN users u ON b.client_id = u.id 
                ORDER BY b.id DESC`;
        } else {
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

// 2. CONSULTAR DISPONIBILIDADE (GET /availability) 
// (Colocado aqui em cima por segurança de roteamento)
router.get('/availability', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ msg: "Date is required" });

        // 1. Verifica no painel de admin quantos detailers estão escalados (padrão é 2 se não achar nada)
        const capResult = await pool.query(
            "SELECT COALESCE((SELECT total_detailers FROM daily_capacity WHERE work_date = $1), 2) as max_detailers",
            [date]
        );
        const maxDetailers = capResult.rows[0].max_detailers;

        // 2. Busca os horários, conta agendamentos e SÓ bloqueia se atingir o limite
        const result = await pool.query(`
            SELECT booking_time 
            FROM bookings 
            WHERE booking_date = $1 AND status != 'cancelled'
            GROUP BY booking_time
            HAVING COUNT(*) >= $2
        `, [date, maxDetailers]);

        // 3. Devolve um array de horários BLOQUEADOS formatado como "10:00"
        // O substring(0,5) remove os segundos (":00") para facilitar pro Frontend
        res.json(result.rows.map(row => row.booking_time.substring(0, 5)));
        
    } catch(err) { 
        console.error("Erro na rota availability:", err);
        res.status(500).send('Server Error'); 
    }
});

// 3. HISTÓRICO DE AGENDAMENTOS
router.get('/history', auth, async (req, res) => {
    try {
        const query = req.user.role === 'client' 
            ? `SELECT b.*, s.name as service_name FROM bookings b 
               LEFT JOIN services s ON b.service_id = s.id 
               WHERE b.client_id = $1 ORDER BY b.booking_date DESC`
            : `SELECT b.*, s.name as service_name FROM bookings b 
               LEFT JOIN services s ON b.service_id = s.id 
               WHERE b.detailer_id = $1 ORDER BY b.booking_date ASC`;
        const result = await pool.query(query, [req.user.id]);
        res.json(result.rows);
    } catch(err) { res.status(500).send('Server Error'); }
});

// 4. CRIAR AGENDAMENTO
router.post('/', auth, async (req, res) => {
    const { service_id, booking_date, booking_time, address, car_size, latitude, longitude } = req.body;
    try {
        const priceQuery = await pool.query('SELECT price FROM service_prices WHERE service_id = $1 AND vehicle_size = $2', [service_id, car_size]);
        if (priceQuery.rows.length === 0) return res.status(400).json({ msg: "Price not found." });
        const realPrice = priceQuery.rows[0].price;
        const result = await pool.query(
            `INSERT INTO bookings (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, realPrice, latitude, longitude]
        );
        await createNotification(req.user.id, "Booking Received", `Request for ${booking_date}.`);
        res.status(201).json({ msg: "Booking created successfully!", booking: result.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

// 5. ATUALIZAR STATUS E NOTAS (ADMIN)
router.put('/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const { status, admin_notes } = req.body; 
    
    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });
    
    try {
        const result = await pool.query(
            "UPDATE bookings SET status = $1, admin_notes = $2 WHERE id = $3 RETURNING *", 
            [status, admin_notes || null, bookingId]
        );
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        const booking = result.rows[0];
        
        if (status === 'confirmed') await createNotification(booking.client_id, "Confirmed", "Service approved.");
        if (status === 'completed') await createNotification(booking.client_id, "Completed", "Service done.");
        
        res.json({ msg: `Status updated to ${status}`, booking });
    } catch (err) { res.status(500).send('Server Error'); }
});

// 6. ACEITAR SERVIÇO (DETAILER)
router.put('/accept/:id', auth, async (req, res) => {
    if (req.user.role !== 'detailer') return res.status(403).json({ msg: 'Access denied.' });
    try {
        const update = await pool.query("UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *", [req.user.id, req.params.id]);
        res.json({ msg: "Accepted", booking: update.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

// 7. CANCELAR SERVIÇO
router.put('/cancel/:id', auth, async (req, res) => {
    try {
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
        res.json({ msg: "Cancelled" });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;