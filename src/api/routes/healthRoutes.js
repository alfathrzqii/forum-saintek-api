const express = require('express');
const router = express.Router();
const healthController = require('../controllers/healthController');

/**
 * @swagger
 * /api/health:
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
