const requiredConfigs = [
  'ACCESS_TOKEN_KEY',
  'REFRESH_TOKEN_KEY',
  'DATABASE_URL',
] as const;

for (const key of requiredConfigs) {
  if (!process.env[key]) {
    console.error(`[FATAL ERROR]: Variabel lingkungan "${key}" tidak ditemukan!`);
    console.error('Pastikan file .env sudah dikonfigurasi dengan benar.');
    process.exit(1);
  }
}

export const config = {
  app: {
    port: Number.parseInt(process.env.PORT ?? '', 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost',
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['*'],
  },
  jwt: {
    accessTokenKey: process.env.ACCESS_TOKEN_KEY as string,
    refreshTokenKey: process.env.REFRESH_TOKEN_KEY as string,
    accessTokenAge: '15m',
  },
  db: {
    url: process.env.DATABASE_URL as string,
  },
} as const;

export default config;
