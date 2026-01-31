// utils/notificationHelper.js
const pool = require('../config/db');

const createNotification = async (userId, title, message) => {
    try {
        // Tenta inserir a notificação. Se a tabela não existir, ele apenas loga o erro e não derruba o app.
        await pool.query(
            "INSERT INTO notifications (user_id, title, message, created_at) VALUES ($1, $2, $3, NOW())",
            [userId, title, message]
        );
        console.log(`🔔 Notificação criada para User ${userId}: ${title}`);
    } catch (err) {
        // Se der erro (ex: tabela não existe), apenas avisa no console
        console.error("⚠️ Erro silencioso ao criar notificação (Verifique se a tabela 'notifications' existe):", err.message);
    }
};

module.exports = { createNotification };