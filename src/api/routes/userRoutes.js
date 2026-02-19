const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/', userController.postUser);

router.get('/me', authenticationMiddleware, (req, res) => {
  res.json({
    status: 'success',
    data: req.user // Menampilkan data dari token
  });
});

router.get('/', authenticationMiddleware, roleMiddleware(['ADMIN']), userController.getAllUsers);

module.exports = router;