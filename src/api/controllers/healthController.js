const prisma = require('../../utils/prisma');
const { successResponse } = require('../../utils/response');

const getHealth = async (req, res, next) => {
  try {
    // Validasi koneksi database dengan query sederhana
    await prisma.$queryRaw`SELECT 1`;

    return successResponse(res, 'Sistem berjalan normal', {
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    // Jika DB down, kirim 503 Service Unavailable
    res.status(503).json({
      status: 'error',
      message: 'Sistem tidak sehat: Koneksi database terputus',
      details: error.message,
    });
  }
};

module.exports = { getHealth };
