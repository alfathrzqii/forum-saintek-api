const express = require('express');
const router = express.Router();
const threadController = require('../controllers/threadController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../../validators/commonValidator');
const { createThreadSchema } = require('../../validators/threadValidator');

/**
 * @openapi
 * tags:
 *   name: Threads
 *   description: API untuk manajemen postingan/thread
 */

/**
 * @openapi
 * /threads:
 *   get:
 *     summary: Mendapatkan semua daftar thread
 *     tags: [Threads]
 *     parameters:
 *       - in: query
 *         name: subforum
 *         schema:
 *           type: string
 *         description: Filter berdasarkan slug subforum
 *     responses:
 *       200:
 *         description: Daftar thread berhasil dimuat
 */
router.get('/', threadController.getThreads);

/**
 * @openapi
 * /threads/{id}:
 *   get:
 *     summary: Mendapatkan detail thread berdasarkan ID
 *     tags: [Threads]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detail thread berhasil dimuat
 *       404:
 *         description: Thread tidak ditemukan
 */
router.get('/:id', validate({ params: idParamSchema }), threadController.getThreadById);

/**
 * @openapi
 * /threads:
 *   post:
 *     summary: Membuat thread baru
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - subforumSlug
 *             properties:
 *               title:
 *                 type: string
 *                 example: Info Beasiswa Fakultas
 *               content:
 *                 type: string
 *                 example: Ada info beasiswa baru nih temen-temen...
 *               subforumSlug:
 *                 type: string
 *                 example: informatika
 *               isAnonymous:
 *                 type: boolean
 *                 default: false
 *               imageUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Thread berhasil dipublikasikan
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: createThreadSchema }), 
  threadController.postThread
);

/**
 * @openapi
 * /threads/{id}:
 *   delete:
 *     summary: Menghapus thread (Pemilik atau Admin)
 *     tags: [Threads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Thread berhasil dihapus
 *       403:
 *         description: Forbidden (Bukan pemilik/admin)
 */
router.delete('/:id', authenticationMiddleware, validate({ params: idParamSchema }), threadController.deleteThread);


module.exports = router;
