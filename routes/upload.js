const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase'); 
const pool = require('../config/db');
const auth = require('../middleware/auth');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/:bookingId', auth, upload.single('photo'), async (req, res) => {
    const { bookingId } = req.params;
    const { notes } = req.body; 
    const file = req.file;      
    
    // DEBUG: Vamos ver o que tem dentro do seu usuário logado
    console.log("--- DEBUG UPLOAD ---");
    console.log("Dados do req.user:", req.user);
    console.log("BookingID recebido:", bookingId);

    const userId = req.user?.id || req.user?.user_id; // Tenta pegar id ou user_id

    try {
        // 1. Verificar se o agendamento existe (Sem travar no dono por enquanto para testar)
        const checkBooking = await pool.query(
            'SELECT * FROM bookings WHERE id = $1',
            [bookingId]
        );

        if (checkBooking.rows.length === 0) {
            console.log("❌ Erro: Agendamento ID", bookingId, "não existe no banco.");
            return res.status(404).json({ msg: 'Booking not found.' });
        }

        console.log("✅ Agendamento encontrado. Iniciando processo...");

        let publicUrl = null;

        // 2. Upload para o Supabase Storage
        if (file) {
            const fileName = `booking_${bookingId}_${Date.now()}.jpg`;
            const { data, error } = await supabase.storage
                .from('booking-photos')
                .upload(fileName, file.buffer, { contentType: file.mimetype });

            if (error) {
                console.log("❌ Erro Supabase Storage:", error.message);
                return res.status(500).json({ error: "Storage error: " + error.message });
            }

            publicUrl = supabase.storage.from('booking-photos').getPublicUrl(fileName).data.publicUrl;
            console.log("📸 Foto salva com sucesso:", publicUrl);
        }

        // 3. Update no Banco de Dados
        // IMPORTANTE: COALESCE evita erro se a coluna photos estiver NULL
        const updateQuery = `
            UPDATE bookings 
            SET notes = $1, 
                photos = array_append(COALESCE(photos, '{}'), $2) 
            WHERE id = $3 
            RETURNING *
        `;
        
        const updateResult = await pool.query(updateQuery, [notes || '', publicUrl, bookingId]);
        
        console.log("🚀 SUCESSO! Banco de dados atualizado.");
        res.json(updateResult.rows[0]);

    } catch (err) {
        console.error("🔥 ERRO CRÍTICO NO UPLOAD:", err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;