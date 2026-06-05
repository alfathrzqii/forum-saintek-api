const { rateLimit } = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  limit: 100, // Batasi tiap IP ke 100 request per windowMs
  standardHeaders: 'draft-7', // set `RateLimit` header
  legacyHeaders: false, // Matikan `X-RateLimit-*` headers
  message: {
    status: 'fail',
    message: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi setelah 15 menit',
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  limit: 10, // Batasi tiap IP ke 10 request login/register per jam
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    status: 'fail',
    message: 'Terlalu banyak percobaan login/register, silakan coba lagi setelah 1 jam',
  },
});

module.exports = {
  globalLimiter,
  authLimiter,
};
