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
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Berhasil memuat pesan selamat datang
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: integer
 *                     timestamp:
 *                       type: string
 *                     database:
 *                       type: string
 *       503:
 *         description: Sistem bermasalah (Database terputus)
 */
router.get('/', healthController.getHealth);

module.exports = router;
