// middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // 1. Tenta buscar o token de dois lugares: 'Authorization' ou 'x-auth-token'
  let token = req.header('Authorization') || req.header('x-auth-token');

  // 2. Se o token vier no formato "Bearer <token>", nós limpamos o prefixo
  if (token && token.startsWith('Bearer ')) {
    token = token.split(' ')[1];
  }

  // 3. Verifica se o token existe
  if (!token) {
    return res.status(401).json({ msg: 'Nenhum token, autorização negada.' });
  }

  // 4. Validação
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Anexa os dados decodificados (id e role) ao req.user
    req.user = decoded.user; 
    next(); 
    
  } catch (err) {
    res.status(401).json({ msg: 'Token inválido ou expirado.' });
  }
};