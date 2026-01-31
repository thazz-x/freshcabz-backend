const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
// Importante: Importar o helper de notificação
const { createNotification } = require('../utils/notificationHelper');

// 1. CRIAR AGENDAMENTO (Client Creates Booking)
router.post('/', auth, async (req, res) => {
    const { 
        service_id, booking_date, booking_time, address, 
        car_size, final_price, latitude, longitude 
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO bookings 
            (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude]
        );

        const booking = result.rows[0];

        // 🔔 ENGLISH NOTIFICATION: Booking Received
        await createNotification(
            req.user.id, 
            "Booking Received ✅", 
            `We received your request for ${booking_date} at ${booking_time}. Waiting for a detailer to accept.`
        );

        res.status(201).json({ msg: "Booking created successfully!", booking });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 2. DETAILER ACEITA (Detailer Accepts Job)
router.put('/accept/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const detailerId = req.user.id;

    if (req.user.role !== 'detailer') {
        return res.status(403).json({ msg: 'Access denied. Detailers only.' });
    }

    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Booking not found' });
        
        const booking = bookingCheck.rows[0];

        if (booking.status !== 'pending') {
             return res.status(400).json({ msg: 'This job is no longer available.' });
        }

        const update = await pool.query(
            "UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *",
            [detailerId, bookingId]
        );

        // 🔔 ENGLISH NOTIFICATION: Detailer Found (Sent to Client)
        await createNotification(
            booking.client_id, 
            "Detailer Found! 🚗", 
            `A pro detailer has accepted your job for ${booking.booking_date}. Get your car ready!`
        );

        res.json({ 
            msg: "Job accepted successfully!", 
            booking: update.rows[0] 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 3. DETAILER A CAMINHO (Detailer Arriving - Nova Rota)
router.put('/arriving/:id', auth, async (req, res) => {
    const bookingId = req.params.id;

    if (req.user.role !== 'detailer') {
        return res.status(403).json({ msg: 'Access denied.' });
    }

    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        
        const booking = bookingCheck.rows[0];

        // 🔔 ENGLISH NOTIFICATION: Arriving Soon
        await createNotification(
            booking.client_id, 
            "Detailer Arriving! 📍", 
            "Your detailer is en route and will arrive in approximately 10 minutes."
        );

        res.json({ msg: "Client notified." });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// 4. CANCELAR (Cancel Booking)
router.put('/cancel/:id', auth, async (req, res) => {
    const bookingId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;

    try {
        const bookingCheck = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
        if (bookingCheck.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        
        const booking = bookingCheck.rows[0];

        // Validação
        if (userRole === 'client' && booking.client_id !== userId) {
            return res.status(403).json({ msg: 'Not authorized.' });
        }

        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);

        // 🔔 ENGLISH NOTIFICATION: Cancelled
        await createNotification(
            booking.client_id, 
            "Booking Cancelled ❌", 
            `The service scheduled for ${booking.booking_date} has been cancelled.`
        );

        res.json({ msg: "Cancelled successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- ROTA DE DISPONIBILIDADE (GET) ---
router.get('/availability', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ msg: "Date is required" });
        const result = await pool.query("SELECT booking_time FROM bookings WHERE booking_date = $1 AND status != 'cancelled'", [date]);
        res.json(result.rows.map(row => row.booking_time));
    } catch(err) { res.status(500).send('Server Error'); }
});

// --- ROTA DE HISTÓRICO (GET) ---
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

// --- ROTA DE VAGAS DISPONÍVEIS (GET) - Para a próxima etapa ---
router.get('/available', auth, async (req, res) => {
    if (req.user.role !== 'detailer') {
        return res.status(403).json({ msg: 'Access denied. Detailers only.' });
    }
    try {
        const result = await pool.query(
            `SELECT b.*, s.name as service_name, s.duration_minutes, u.name as client_name, u.phone as client_phone
             FROM bookings b
             JOIN services s ON b.service_id = s.id
             JOIN users u ON b.client_id = u.id
             WHERE b.status = 'pending'
             ORDER BY b.booking_date ASC, b.booking_time ASC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error fetching jobs.');
    }
});

module.exports = router;