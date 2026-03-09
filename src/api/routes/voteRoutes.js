const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');

// Protected: User harus login untuk bisa Upvote/Downvote
router.post('/', authenticationMiddleware, voteController.toggleVote);

module.exports = router;