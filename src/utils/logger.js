const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.app.nodeEnv === 'development' ? 'debug' : 'info',
  transport: config.app.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

module.exports = logger;