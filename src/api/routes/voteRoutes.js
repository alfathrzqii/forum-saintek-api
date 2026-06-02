const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { voteSchema } = require('../../validators/voteValidator');

// Protected: User harus login untuk bisa Upvote/Downvote
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: voteSchema }), 
  voteController.toggleVote
);


module.exports = router;