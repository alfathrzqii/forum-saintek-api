const express = require('express');
const router = express.Router();
const subforumController = require('../controllers/subforumController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const validate = require('../middlewares/validateMiddleware');
const { createSubforumSchema } = require('../../validators/subforumValidator');

/**
 * @openapi
 * tags:
 *   name: Subforums
 *   description: API untuk kategori/sub-forum
 */

/**
 * @openapi
 * /api/subforums:
 *   get:
 *     summary: Mendapatkan semua daftar subforum
 *     tags: [Subforums]
 *     responses:
 *       200:
 *         description: Daftar subforum berhasil dimuat
 */
router.get('/', subforumController.getSubforums);

/**
 * @openapi
 * /api/subforums/{slug}:
 *   get:
 *     summary: Mendapatkan detail subforum berdasarkan slug
 *     tags: [Subforums]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: informatika
 *     responses:
 *       200:
 *         description: Detail subforum berhasil dimuat
 *       404:
 *         description: Subforum tidak ditemukan
 */
router.get('/:slug', subforumController.getSubforumBySlug);

/**
 * @openapi
 * /api/subforums:
 *   post:
 *     summary: Membuat subforum baru (Hanya Admin)
 *     tags: [Subforums]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 example: Teknik Industri
 *               description:
 *                 type: string
 *                 example: Wadah diskusi mahasiswa Teknik Industri
 *     responses:
 *       201:
 *         description: Subforum berhasil dibuat
 *       403:
 *         description: Forbidden (Bukan Admin)
 */
router.post(
  '/', 
  authenticationMiddleware, 
  roleMiddleware(['ADMIN']), 
  validate({ body: createSubforumSchema }),
  subforumController.postSubforum
);


module.exports = router;