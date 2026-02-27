const jwt = require('jsonwebtoken');
const config = require('../../config');
const userRepository = require('../../repositories/userRepository');
const AuthenticationError = require('../../exceptions/AuthenticationError');

/**
 * Middleware untuk memvalidasi Access Token (JWT)
 * Menghasilkan status 401 jika token tidak valid/tidak ada
 */
const authenticationMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 1. Validasi keberadaan dan format header (Bearer <token>)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Token tidak ditemukan atau format salah');
    }

    const token = authHeader.split(' ')[1];

    // 2. Verifikasi JWT
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessTokenKey);
    } catch (err) {
      // Jika jwt.verify gagal (malformed/expired), lempar 401 via exception
      throw new AuthenticationError('Token tidak valid atau sudah kadaluarsa');
    }

    // 3. Pengecekan eksistensi user di Database (Security Check)
    const user = await userRepository.findUserById(decoded.id);
    
    if (!user) {
      throw new AuthenticationError('User sudah tidak terdaftar atau akun telah dihapus');
    }

    // 4. Berhasil: Tempelkan objek user (tanpa password biasanya sudah di-handle repo) ke request
    req.user = user; 
    
    next();
  } catch (error) {
    // 5. Oper ke errorMiddleware (Phase 3) untuk dikirim sebagai JSON 401
    next(error);
  }
};

module.exports = authenticationMiddleware;