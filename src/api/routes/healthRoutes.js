const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

/**
 * @openapi
 * tags:
 *   name: Monitoring
 *   description: API untuk pemantauan kesehatan sistem
 */

/**
 * @openapi
 * /:
 *   get:
 *     summary: Welcome message (Base API)
 *     responses:
 *       200:
 *         description: Berhasil memuat pesan selamat datang
 */

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Periksa kesehatan sistem dan koneksi database
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: Sistem sehat
 *       503:
 *         description: Sistem bermasalah (Database terputus)
 */
router.get('/', healthController.getHealth);

module.exports = router;
