const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Dasar
app.use(helmet());
app.use(cors());
app.use(express.json());

// Route Testing (Health Check)
app.get('/', (req, res) => {
  res.json({
    message: "Selamat datang di API Forum SAINTEK!",
    status: "Server is running perfectly"
  });
});

// Menjalankan Server
app.listen(PORT, () => {
  console.log(`🚀 Server nyala di: http://localhost:${PORT}`);
});