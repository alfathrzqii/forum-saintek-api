const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { threadIdParamSchema } = require('../../validators/commonValidator');
const { createCommentSchema } = require('../../validators/commentValidator');

// Public: Melihat pohon komentar dari sebuah thread
router.get('/thread/:threadId', validate({ params: threadIdParamSchema }), commentController.getComments);

// Protected: Menambah komentar atau membalas (reply) komentar lain
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: createCommentSchema }), 
  commentController.postComment
);


module.exports = router;