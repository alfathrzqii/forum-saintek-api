import { swagger } from '@elysiajs/swagger';
import { config } from '../config/index.ts';

export const swaggerPlugin = swagger({
  path: '/api-docs',
  specPath: '/api-docs/json',
  provider: 'swagger-ui',
  documentation: {
    openapi: '3.0.0',
    info: {
      title: 'Forum SAINTEK API Documentation',
      version: '1.0.0',
      description:
        'Dokumentasi interaktif untuk API Forum SAINTEK menggunakan Swagger',
    },
    servers: [
      {
        url: 'https://api.forumsaintek.my.id/api',
        description: 'Production Server',
      },
      {
        url: `${config.app.baseUrl}/api`,
        description: 'Development Server (Local)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    tags: [
      { name: 'General', description: 'Base API endpoint' },
      { name: 'Monitoring', description: 'API untuk pemantauan kesehatan sistem' },
      { name: 'Authentications', description: 'API untuk autentikasi pengguna' },
      { name: 'Users', description: 'API untuk manajemen pengguna' },
      { name: 'Subforums', description: 'API untuk manajemen subforum' },
      { name: 'Threads', description: 'API untuk manajemen thread diskusi' },
      { name: 'Comments', description: 'API untuk manajemen komentar' },
      { name: 'Votes', description: 'API untuk manajemen vote' },
    ],
  },
});

export default swaggerPlugin;
