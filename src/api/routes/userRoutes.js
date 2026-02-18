const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/', userController.postUser);

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    status: 'success',
    data: req.user // Menampilkan data dari token
  });
});

router.get('/', authMiddleware, roleMiddleware(['ADMIN']), userController.getAllUsers);

module.exports = router;