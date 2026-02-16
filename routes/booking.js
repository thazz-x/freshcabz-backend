const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { createNotification } = require('../utils/notificationHelper');

// --- 1. ROTA DE ESTATÍSTICAS FINANCEIRAS (DASHBOARD) ---
// Calcula o faturamento direto no SQL para máxima performance
router.get('/stats', auth, async (req, res) => {
    // Segurança: Apenas Admin acessa
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied.' });
    }

    try {
        // A QUERY "MAGICA":
        // 1. Filtra apenas status 'completed'
        // 2. Converte final_price para NUMERIC (::numeric) para evitar erro se estiver como texto
        // 3. Compara datas corretamente
        const query = `
            SELECT 
                -- Faturamento Hoje
                COALESCE(SUM(CASE 
                    WHEN booking_date::date = CURRENT_DATE 
                    THEN final_price::numeric 
                    ELSE 0 
                END), 0) as today,
                
                -- Faturamento da Semana (Começando Segunda ou Domingo dependendo da config do banco)
                COALESCE(SUM(CASE 
                    WHEN booking_date::date >= date_trunc('week', CURRENT_DATE)::date 
                    THEN final_price::numeric 
                    ELSE 0 
                END), 0) as week,
                
                -- Faturamento do Mês
                COALESCE(SUM(CASE 
                    WHEN booking_date::date >= date_trunc('month', CURRENT_DATE)::date 
                    THEN final_price::numeric 
                    ELSE 0 
                END), 0) as month,
                
                -- Total de Serviços Feitos
                COUNT(*) as total_completed_count

            FROM bookings 
            WHERE status = 'completed'
        `;

        const result = await pool.query(query);
        
        // Retorna exatamente o formato que o Frontend espera
        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error in GET /stats:", err.message);
        res.status(500).send('Server Error');
    }
});

// --- 2. LISTAR AGENDAMENTOS ---
router.get('/', auth, async (req, res) => {
    try {
        let query;
        let params = [];

        if (req.user.role === 'admin') {
            // Admin vê tudo + Dados do Cliente
            query = `
                SELECT b.*, s.name as service_name, u.name as client_name, u.phone as client_phone 
                FROM bookings b 
                LEFT JOIN services s ON b.service_id = s.id 
                LEFT JOIN users u ON b.client_id = u.id 
                ORDER BY b.id DESC`; // Ordenar por ID é mais seguro que data
        } else {
            // Cliente vê só os seus
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

// --- 3. CRIAR NOVO AGENDAMENTO ---
router.post('/', auth, async (req, res) => {
    const { 
        service_id, booking_date, booking_time, address, 
        car_size, latitude, longitude 
    } = req.body;
   
    try {
        // Validação de Preço no Backend (Segurança)
        const priceQuery = await pool.query(
            'SELECT price FROM service_prices WHERE service_id = $1 AND vehicle_size = $2',
            [service_id, car_size]
        );

        if (priceQuery.rows.length === 0) {
            return res.status(400).json({ msg: "Price configuration not found." });
        }

        const realPrice = priceQuery.rows[0].price;
    
        const result = await pool.query(
            `INSERT INTO bookings 
            (client_id, service_id, booking_date, booking_time, address, car_size, final_price, latitude, longitude) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [req.user.id, service_id, booking_date, booking_time, address, car_size, realPrice, latitude, longitude]
        );

        const booking = result.rows[0];

        // Notificação
        await createNotification(
            req.user.id, 
            "Booking Received ✅", 
            `We received your request for ${booking_date}.`
        );

        res.status(201).json({ msg: "Booking created successfully!", booking });
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

    try {
        const result = await pool.query(
            "UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *",
            [status, bookingId]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Not found' });
        const booking = result.rows[0];

        // Dispara notificações baseadas no novo status
        if (status === 'confirmed') {
            await createNotification(booking.client_id, "Booking Confirmed! ✅", "Your service has been approved.");
        } else if (status === 'completed') {
            await createNotification(booking.client_id, "Service Completed! ✨", "Your car is ready!");
        }

        res.json({ msg: `Status updated to ${status}`, booking });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- 5. ROTAS EXTRAS (Detailer, Cancel, History) ---

router.put('/accept/:id', auth, async (req, res) => {
    if (req.user.role !== 'detailer') return res.status(403).json({ msg: 'Access denied.' });
    try {
        const check = await pool.query("SELECT status FROM bookings WHERE id = $1", [req.params.id]);
        if (check.rows.length === 0 || check.rows[0].status !== 'pending') {
            return res.status(400).json({ msg: 'Job not available.' });
        }
        const update = await pool.query(
            "UPDATE bookings SET detailer_id = $1, status = 'confirmed' WHERE id = $2 RETURNING *",
            [req.user.id, req.params.id]
        );
        res.json({ msg: "Job accepted!", booking: update.rows[0] });
    } catch (err) { res.status(500).send('Server Error'); }
});

router.put('/cancel/:id', auth, async (req, res) => {
    try {
        await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [req.params.id]);
        res.json({ msg: "Cancelled" });
    } catch (err) { res.status(500).send('Server Error'); }
});

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