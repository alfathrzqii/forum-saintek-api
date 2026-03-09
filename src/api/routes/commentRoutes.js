const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');

// Public: Melihat pohon komentar dari sebuah thread
router.get('/thread/:threadId', commentController.getComments);

// Protected: Menambah komentar atau membalas (reply) komentar lain
router.post('/', authenticationMiddleware, commentController.postComment);

module.exports = router;