const ClientError = require('../../exceptions/ClientError');
const logger = require('../../utils/logger');

const errorMiddleware = (err, req, res, next) => {
  // 1. Jika error adalah bagian dari ClientError (400-499)
  if (err instanceof ClientError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // 2. Jika error dari Zod (Validasi input)
  if (err.name === 'ZodError') {
    return res.status(400).json({
      status: 'error',
      message: err.errors[0].message,
    });
  }

  // 3. Jika error tidak dikenal (Server Error 500)
  logger.error(err); 

  return res.status(500).json({
    status: 'error',
    message: 'Maaf, terjadi kegagalan pada server kami.',
  });
};

module.exports = errorMiddleware;