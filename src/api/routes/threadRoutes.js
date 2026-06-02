const express = require('express');
const router = express.Router();
const threadController = require('../controllers/threadController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../../validators/commonValidator');
const { createThreadSchema } = require('../../validators/threadValidator');

// Public: Siapa saja bisa baca thread
router.get('/', threadController.getThreads);

// Protected: Harus login untuk posting atau hapus
router.post(
  '/', 
  authenticationMiddleware, 
  validate({ body: createThreadSchema }), 
  threadController.postThread
);
router.delete('/:id', authenticationMiddleware, validate({ params: idParamSchema }), threadController.deleteThread);



module.exports = router;