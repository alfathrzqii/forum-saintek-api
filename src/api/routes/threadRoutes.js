const express = require('express');
const router = express.Router();
const threadController = require('../controllers/threadController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');

// Public: Siapa saja bisa baca thread
router.get('/', threadController.getThreads);

// Protected: Harus login untuk posting atau hapus
router.post('/', authenticationMiddleware, threadController.postThread);
router.delete('/:id', authenticationMiddleware, threadController.deleteThread);

module.exports = router;