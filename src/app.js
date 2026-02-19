const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const pinoHttp = require('pino-http');

const logger = require('./utils/logger');
const config = require('./config');

const subforumRoutes = require('./api/routes/subforumRoutes');
const userRoutes = require('./api/routes/userRoutes');
const authenticationRoutes = require('./api/routes/authenticationRoutes');

const errorMiddleware = require('./api/middlewares/errorMiddleware');
const authenticationMiddleware = require('./api/middlewares/authenticationMiddleware');

dotenv.config();

const app = express();
const PORT = config.app.port;

// Middleware Dasar
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/subforums', subforumRoutes);
app.use('/api/users', userRoutes);
app.use('/api/authentications', authenticationRoutes);

app.use(errorMiddleware);

// Route Testing (Health Check)
app.get('/', (req, res) => {
  res.json({
    message: "Selamat datang di API Forum SAINTEK!",
    status: "Server is running perfectly"
  });
});

// Rute testing untuk mengecek siapa yang login
app.get('/api/auth/me', authenticationMiddleware, (req, res) => {
  res.json({
    status: 'success',
    data: req.user // req.user ini diisi oleh authenticationMiddleware
  });
});

// Menjalankan Server
if (config.app.nodeEnv !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

module.exports = app;