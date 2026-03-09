const express = require('express');
const router = express.Router();
const subforumController = require('../controllers/subforumController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Public: Siapa saja bisa lihat daftar subforum
router.get('/', subforumController.getSubforums);
router.get('/:slug', subforumController.getSubforumBySlug);

// Admin Only: Hanya admin yang bisa buat subforum baru
router.post(
  '/', 
  authenticationMiddleware, 
  roleMiddleware(['ADMIN']), 
  subforumController.postSubforum
);

module.exports = router;