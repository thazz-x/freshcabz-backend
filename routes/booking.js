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
            // 👮 ADMIN: Busca TUDO
            // Nota: Se der erro de 'created_at', mude para 'booking_date', mas mantive o original
            query = `
                SELECT b.*, s.name as service_name, u.name as client_name, u.phone as client_phone 
                FROM bookings b 
                LEFT JOIN services s ON b.service_id = s.id 
                LEFT JOIN users u ON b.client_id = u.id 
                ORDER BY b.created_at DESC`;
        } else {
            // 👤 CLIENTE: Busca os seus
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
            return res.status(400).json({ msg: "Price not found for this service and car size." });
        }

        const realPrice = priceQuery.rows[0].price;
    
        const result = await pool.query(
            `INSERT INTO bookings 
            (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, realPrice, latitude, longitude]
        );

        const booking = result.rows[0];

        await createNotification(
            req.user.id, 
            "Booking Received ✅", 
            `We received your request for ${booking_date} at ${booking_time}. Waiting for approval.`
        );

        res.status(201).json({ msg: "Booking created successfully!", booking });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 3. ATUALIZAR STATUS
router.put('/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const { status } = req.body;

    if (req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied. Admins only.' });

    const validStatus = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatus.includes(status)) return res.status(400).json({ msg: 'Invalid status' });

    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Booking not found' });
        
        const booking = bookingCheck.rows[0];

        const result = await pool.query(
            "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *",
            [status, bookingId]
        );

        let title = "";
        let body = "";

        if (status === 'confirmed') {
            title = "Booking Confirmed! ✅";
            body = `Your service for ${booking.booking_date} has been approved.`;
        } else if (status === 'completed') {
            title = "Service Completed! ✨";
            body = "Your car is fresh and clean! Thank you for choosing FreshCabz.";
        }

        if (title) await createNotification(booking.client_id, title, body);

        res.json({ msg: `Status updated to ${status}`, booking: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 4. DETAILER ACEITA
router.put('/accept/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const detailerId = req.user.id;

    if (req.user.role !== 'detailer') return res.status(403).json({ msg: 'Access denied.' });

    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        
        const booking = bookingCheck.rows[0];
        if (booking.status !== 'pending') return res.status(400).json({ msg: 'Job no longer available.' });

        const update = await pool.query(
            "UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *",
            [detailerId, bookingId]
        );

        await createNotification(booking.client_id, "Detailer Found! 🚗", "A pro has accepted your job!");

        res.json({ msg: "Job accepted!", booking: update.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

// 5. CANCELAR
router.put('/cancel/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        
        const booking = bookingCheck.rows[0];
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);

        await createNotification(booking.client_id, "Booking Cancelled ❌", "Your service has been cancelled.");

        res.json({ msg: "Cancelled successfully" });
    } catch (err) { res.status(500).send('Server Error'); }
});

// ROTAS EXTRAS
router.get('/history', auth, async (req, res) => {
    const userId = req.user.id;
    const userRole = req.user.role;
    try {
        let query = userRole === 'client' 
            ? 'SELECT b.*, s.name as service_name FROM bookings b JOIN services s ON b.service_id = s.id WHERE b.client_id = $1 ORDER BY b.booking_date DESC'
            : 'SELECT b.*, s.name as service_name, u.name as client_name FROM bookings b JOIN services s ON b.service_id = s.id JOIN users u ON b.client_id = u.id WHERE b.detailer_id = $1 ORDER BY b.booking_date ASC';
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch(err) { res.status(500).send('Server Error'); }
});

router.get('/availability', async (req, res) => {
    try {
        const { date } = req.query;
        const result = await pool.query("SELECT booking_time FROM bookings WHERE booking_date = $1 AND status != 'cancelled'", [date]);
        res.json(result.rows.map(row => row.booking_time));
    } catch(err) { res.status(500).send('Server Error'); }
});

module.exports = router;