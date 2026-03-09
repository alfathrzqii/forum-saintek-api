const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { successResponse } = require('../../utils/response');

router.post('/', userController.postUser);

router.get('/me', authenticationMiddleware, (req, res) => {
  return successResponse(res, 'Profil berhasil dimuat', req.user);
});

router.get('/', authenticationMiddleware, roleMiddleware(['ADMIN']), userController.getAllUsers);

module.exports = router;