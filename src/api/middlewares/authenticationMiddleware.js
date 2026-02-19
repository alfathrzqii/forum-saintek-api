const jwt = require('jsonwebtoken');
const userRepository = require('../../repositories/userRepository');

const authenticationMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ status: 'error', message: 'Token tidak ditemukan' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
    
    // PENGECEKAN EKSISTENSI USER
    const user = await userRepository.findUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ 
        status: 'error', 
        message: 'User sudah tidak terdaftar atau akun telah dihapus' 
      });
    }

    // Tempelkan data user yang fresh dari DB ke request
    req.user = user; 
    next();
  } catch (error) {
    return res.status(403).json({ status: 'error', message: 'Token tidak valid atau kadaluarsa' });
  }
};

module.exports = authenticationMiddleware;