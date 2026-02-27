const dotenv = require('dotenv');

dotenv.config();

const config = {
  app: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost',
  },
  jwt: {
    accessTokenKey: process.env.ACCESS_TOKEN_KEY,
    refreshTokenKey: process.env.REFRESH_TOKEN_KEY,
    accessTokenAge: '15m',
  },
};

// Daftar variabel yang WAJIB ada di .env
const requiredConfigs = [
  'ACCESS_TOKEN_KEY',
  'REFRESH_TOKEN_KEY',
  'DATABASE_URL',
];

// Validasi saat aplikasi start
requiredConfigs.forEach((key) => {
  /* istanbul ignore next */
  if (!process.env[key]) {
    console.error(`[FATAL ERROR]: Variabel lingkungan "${key}" tidak ditemukan!`);
    console.error(`Pastikan file .env sudah dikonfigurasi dengan benar.`);
    process.exit(1);
  }
});

module.exports = config;