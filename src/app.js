const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

const subforumRoutes = require('./api/routes/subforumRoutes');
const userRoutes = require('./api/routes/userRoutes');
const authenticationRoutes = require('./api/routes/authenticationRoutes');

const authenticationMiddleware = require('./api/middlewares/authenticationMiddleware');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Dasar
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/subforums', subforumRoutes);
app.use('/api/users', userRoutes);
app.use('/api/authentications', authenticationRoutes);

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
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server nyala di: http://localhost:${PORT}`);
  });
}

module.exports = app;