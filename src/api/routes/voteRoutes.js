const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { voteSchema } = require('../../validators/voteValidator');

/**
 * @openapi
 * tags:
 *   name: Votes
 *   description: API untuk sistem voting (Upvote/Downvote)
 */

/**
 * @openapi
 * /votes:
 *   post:
 *     summary: Melakukan voting pada thread atau komentar (Toggle)
 *     tags: [Votes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [UPVOTE, DOWNVOTE]
 *               threadId:
 *                 type: string
 *                 format: uuid
 *               commentId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Berhasil memberikan/mengubah/menghapus vote
 */
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: voteSchema }), 
  voteController.toggleVote
);


module.exports = router;
