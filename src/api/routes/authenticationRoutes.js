const express = require('express');
const router = express.Router();
const authController = require('../controllers/authenticationController');

router.post('/', authController.postAuthentication);
router.put('/', authController.putAuthentication);
router.delete('/', authController.deleteAuthentication);

module.exports = router;