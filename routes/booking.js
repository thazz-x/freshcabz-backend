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
            // Admin vê tudo. Ordenado por ID (O mais seguro)
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

// 2. CRIAR AGENDAMENTO
router.post('/', auth, async (req, res) => {
    const { 
        service_id, booking_date, booking_time, address, 
        car_size, latitude, longitude 
    } = req.body;
   
    try {
        const priceQuery = await pool.query(
            'SELECT price FROM service_prices WHERE service_id = $1 AND vehicle_size = $2',
            [service_id, car_size]
        );

        if (priceQuery.rows.length === 0) {
            return res.status(400).json({ msg: "Price not found." });
        }

        const realPrice = priceQuery.rows[0].price;
    
        const result = await pool.query(
            `INSERT INTO bookings 
            (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, realPrice, latitude, longitude]
        );

        await createNotification(
            req.user.id, "Booking Received", `Request for ${booking_date}.`
        );

        res.status(201).json({ msg: "Booking created successfully!", booking: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 3. ATUALIZAR STATUS
router.put('/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied.' });

    try {
        const result = await pool.query(
            "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *",
            [status, bookingId]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        
        // Notificações Simplificadas para evitar erro
        const booking = result.rows[0];
        if (status === 'confirmed') await createNotification(booking.client_id, "Confirmed", "Service approved.");
        if (status === 'completed') await createNotification(booking.client_id, "Completed", "Service done.");

        res.json({ msg: `Status updated to ${status}`, booking });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- ROTAS EXTRAS (Detailer, Cancel, History, Availability) ---
// Mantenha estas exatamente como estavam ou copie abaixo se tiver dúvida

router.put('/accept/:id', auth, async (req, res) => {
    if (req.user.role !== 'detailer') return res.status(403).json({ msg: 'Access denied.' });
    try {
        const update = await pool.query("UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *", [req.user.id, req.params.id]);
        res.json({ msg: "Accepted", booking: update.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.put('/cancel/:id', auth, async (req, res) => {
    try {
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
        res.json({ msg: "Cancelled" });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.get('/history', auth, async (req, res) => {
    try {
        const query = req.user.role === 'client' 
            ? 'SELECT * FROM bookings WHERE client_id = $1 ORDER BY booking_date DESC'
            : 'SELECT * FROM bookings WHERE detailer_id = $1 ORDER BY booking_date ASC';
        const result = await pool.query(query, [req.user.id]);
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