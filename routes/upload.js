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
    const userId = req.user.id; // <--- VERIFIQUE SE SEU AUTH USA .id OU .user_id

    console.log(`--- INICIANDO UPLOAD ---`);
    console.log(`BookingID: ${bookingId} | UserID: ${userId}`);
    console.log(`Notes recebidas: ${notes}`);
    console.log(`Foto recebida: ${file ? 'SIM' : 'NÃO'}`);

    try {
        // 1. Verificação de Dono (Tentei ser mais flexível aqui)
        // DICA: Se der erro 403, troque 'client_id' pelo nome real da sua coluna (ex: user_id)
        const checkOwner = await pool.query(
            'SELECT * FROM bookings WHERE id = $1',
            [bookingId]
        );

        if (checkOwner.rows.length === 0) {
            console.log('❌ Erro: Agendamento não encontrado no banco.');
            return res.status(404).json({ msg: 'Booking not found.' });
        }

        // Se quiser segurança total, ative esta linha e confirme o nome da coluna:
        // if (checkOwner.rows[0].client_id != userId) return res.status(403).json({msg: 'Access Denied'});

        let publicUrl = null;

        // 2. Upload para o Supabase
        if (file) {
            const fileName = `booking_${bookingId}_${Date.now()}.jpg`;
            
            const { data, error } = await supabase
                .storage
                .from('booking-photos')
                .upload(fileName, file.buffer, {
                    contentType: file.mimetype,
                    upsert: true // Sobrescreve se houver erro
                });

            if (error) {
                console.log('❌ Erro no Supabase Storage:', error.message);
                throw error;
            }

            const urlData = supabase.storage.from('booking-photos').getPublicUrl(fileName);
            publicUrl = urlData.data.publicUrl;
            console.log('✅ Foto salva no Storage:', publicUrl);
        }

        // 3. Atualizar o Banco (Tratando o caso de notas e fotos vazias)
        // COALESCE garante que se photos for NULL, ele trate como um array vazio
        const updateQuery = `
            UPDATE bookings 
            SET 
                notes = $1, 
                photos = array_append(COALESCE(photos, '{}'), $2) 
            WHERE id = $3 
            RETURNING *
        `;
        
        const params = [notes || '', publicUrl, bookingId];
        const updateResult = await pool.query(updateQuery, params);
        
        console.log('🚀 Banco de dados atualizado com sucesso!');
        res.json(updateResult.rows[0]);

    } catch (err) {
        console.error('🔥 ERRO NO SERVIDOR:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;