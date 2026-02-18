const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../config/supabase'); // Importa a config que criamos
const pool = require('../config/db');
const auth = require('../middleware/auth');

// Configura o Multer para pegar o arquivo da memória RAM temporariamente
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ROTA: POST /api/upload/:bookingId
// Recebe: Campo de texto 'notes' e Arquivo 'photo'
router.post('/:bookingId', auth, upload.single('photo'), async (req, res) => {
    const { bookingId } = req.params;
    const { notes } = req.body; // Texto que o cliente digitou
    const file = req.file;      // A imagem

    try {
        // 1. Verificar se o agendamento pertence a este usuário (SEGURANÇA RLS MANUAL)
        const checkOwner = await pool.query(
            'SELECT * FROM bookings WHERE id = $1 AND client_id = $2',
            [bookingId, req.user.id]
        );

        if (checkOwner.rows.length === 0) {
            return res.status(403).json({ msg: 'Not authorized to edit this booking.' });
        }

        let publicUrl = null;

        // 2. Se tiver foto, fazer upload para o Supabase
        if (file) {
            const fileName = `booking_${bookingId}_${Date.now()}.jpg`;
            
            const { data, error } = await supabase
                .storage
                .from('booking-photos')
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype
                });

            if (error) throw error;

            // Gerar link público
            const urlData = supabase
                .storage
                .from('booking-photos')
                .getPublicUrl(fileName);
                
            publicUrl = urlData.data.publicUrl;
        }

        // 3. Atualizar o Banco de Dados (Adiciona foto ao array e atualiza notes)
        // Usamos array_append para não apagar fotos antigas se ele enviar mais de uma
        let query = '';
        let params = [];

        if (publicUrl) {
            query = `
                UPDATE bookings 
                SET notes = $1, photos = array_append(photos, $2) 
                WHERE id = $3 RETURNING *
            `;
            params = [notes, publicUrl, bookingId];
        } else {
            // Se não mandou foto, atualiza só o texto
            query = `
                UPDATE bookings 
                SET notes = $1 
                WHERE id = $2 RETURNING *
            `;
            params = [notes, bookingId];
        }

        const updateResult = await pool.query(query, params);
        
        res.json(updateResult.rows[0]);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error during upload');
    }
});

module.exports = router;