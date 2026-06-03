const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('../config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Forum SAINTEK API Documentation',
      version: '1.0.0',
      description: 'Dokumentasi interaktif untuk API Forum SAINTEK menggunakan Swagger',
    },
    servers: [
      {
        url: `${config.app.baseUrl}:${config.app.port}`,
        description: 'Development Server',
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
  },
  apis: ['./src/api/routes/*.js'], // Path ke file routes untuk dokumentasi
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: 'Forum SAINTEK API Docs'
  }));
};

module.exports = setupSwagger;
