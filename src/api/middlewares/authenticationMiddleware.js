const jwt = require('jsonwebtoken');

const authenticationMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token tidak ditemukan' });
  }

  try {
    // Pastikan pakai ACCESS_TOKEN_KEY
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
    req.user = decoded; // Berisi { id, role, prodi }
    next();
  } catch (error) {
    return res.status(403).json({ status: 'error', message: 'Token tidak valid atau kadaluarsa' });
  }
};

module.exports = authenticationMiddleware;