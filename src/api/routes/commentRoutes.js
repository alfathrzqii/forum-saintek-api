const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { threadIdParamSchema } = require('../../validators/commonValidator');
const { createCommentSchema } = require('../../validators/commentValidator');

/**
 * @openapi
 * tags:
 *   name: Comments
 *   description: API untuk manajemen komentar (Nested Comments)
 */

/**
 * @openapi
 * /api/comments/thread/{threadId}:
 *   get:
 *     summary: Mendapatkan semua komentar dalam sebuah thread
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pohon komentar berhasil dimuat
 */
router.get('/thread/:threadId', validate({ params: threadIdParamSchema }), commentController.getComments);

/**
 * @openapi
 * /api/comments:
 *   post:
 *     summary: Membuat komentar baru atau membalas komentar (Reply)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *               - threadId
 *             properties:
 *               content:
 *                 type: string
 *                 example: Setuju banget sama pendapat ini!
 *               threadId:
 *                 type: string
 *                 format: uuid
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 description: Diisi ID komentar lain jika ingin membalas (Reply)
 *     responses:
 *       201:
 *         description: Komentar berhasil ditambahkan
 */
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: createCommentSchema }), 
  commentController.postComment
);


module.exports = router;