const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 1. Ambil token dari header 'Authorization'
  // Formatnya biasanya: "Bearer <token>"
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Akses ditolak, token tidak ditemukan'
    });
  }

  try {
    // 2. Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Simpan data user hasil decode ke dalam objek 'req' 
    // agar bisa dipakai oleh controller selanjutnya
    req.user = decoded;
    
    // 4. Lanjut ke proses berikutnya
    next();
  } catch (error) {
    return res.status(403).json({
      status: 'error',
      message: 'Token tidak valid atau sudah kadaluarsa'
    });
  }
};

module.exports = authMiddleware;