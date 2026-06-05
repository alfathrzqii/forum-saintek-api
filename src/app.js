const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');

const logger = require('./utils/logger');
const config = require('./config');
const setupSwagger = require('./utils/swagger');

// Routes
const subforumRoutes = require('./api/routes/subforumRoutes');
const userRoutes = require('./api/routes/userRoutes');
const authenticationRoutes = require('./api/routes/authenticationRoutes');
const threadRoutes = require('./api/routes/threadRoutes');
const commentRoutes = require('./api/routes/commentRoutes');
const voteRoutes = require('./api/routes/voteRoutes');

// Middlewares
const NotFoundError = require('./exceptions/NotFoundError');
const errorMiddleware = require('./api/middlewares/errorMiddleware');

const app = express();
const PORT = config.app.port;

// trust proxy diperlukan jika di deploy di belakang reverse proxy (Nginx, Vercel, Heroku, dll)
app.set('trust proxy', 1);

// 1. MIDDLEWARE DASAR (Keamanan & Logging)
const { globalLimiter } = require('./api/middlewares/rateLimitMiddleware');
app.use(globalLimiter);
app.use(compression());
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors());
app.use(express.json());

// Init Swagger
setupSwagger(app);

// 2. PUBLIC ROUTES (Health Check)
app.get('/api', (req, res) => {
  res.json({
    message: "Selamat datang di API Forum SAINTEK!, Server is running perfectly.",
    status: "success"
  });
});

// 3. API ROUTES (Business Logic)
app.use('/api/subforums', subforumRoutes);
app.use('/api/users', userRoutes);
app.use('/api/authentications', authenticationRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/votes', voteRoutes);

// 4. 404 HANDLER (Menangkap rute yang tidak terdaftar)
app.use((req, res, next) => {
  next(new NotFoundError(`Rute ${req.originalUrl} tidak ditemukan`));
});

// 5. ERROR MIDDLEWARE
app.use(errorMiddleware);

// 6. MENJALANKAN SERVER
/* istanbul ignore next */
if (config.app.nodeEnv !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

module.exports = app;