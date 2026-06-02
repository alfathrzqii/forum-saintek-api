const express = require('express');
const router = express.Router();
const authController = require('../controllers/authenticationController');
const validate = require('../middlewares/validateMiddleware');
const { loginSchema, refreshTokenSchema } = require('../../validators/authenticationValidator');

router.post('/', validate({ body: loginSchema }), authController.postAuthentication);
router.put('/', validate({ body: refreshTokenSchema }), authController.putAuthentication);
router.delete('/', validate({ body: refreshTokenSchema }), authController.deleteAuthentication);


module.exports = router;