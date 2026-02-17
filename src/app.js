const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

const subforumRoutes = require('./api/routes/subforumRoutes');
const authRoutes = require('./api/routes/authRoutes');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Dasar
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/subforums', subforumRoutes);
app.use('/api/auth', authRoutes);

// Route Testing (Health Check)
app.get('/', (req, res) => {
  res.json({
    message: "Selamat datang di API Forum SAINTEK!",
    status: "Server is running perfectly"
  });
});

// Menjalankan Server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Server nyala di: http://localhost:${PORT}`);
  });
}

module.exports = app;