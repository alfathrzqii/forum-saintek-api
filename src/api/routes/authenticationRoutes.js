const express = require('express');
const router = express.Router();
const authController = require('../controllers/authenticationController');
const validate = require('../middlewares/validateMiddleware');
const { authLimiter } = require('../middlewares/rateLimitMiddleware');
const { loginSchema, refreshTokenSchema } = require('../../validators/authenticationValidator');

/**
 * @openapi
 * tags:
 *   name: Authentications
 *   description: API untuk manajemen sesi dan autentikasi user
 */

/**
 * @openapi
 * /authentications:
 *   post:
 *     summary: Login user
 *     tags: [Authentications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@student.uin-suka.ac.id
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *     responses:
 *       201:
 *         description: Login berhasil
 *       401:
 *         description: Kredensial tidak valid
 */
router.post('/', authLimiter, validate({ body: loginSchema }), authController.postAuthentication);

/**
 * @openapi
 * /authentications:
 *   put:
 *     summary: Refresh Access Token
 *     tags: [Authentications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token berhasil diperbarui
 *       400:
 *         description: Refresh token tidak valid
 */
router.put('/', validate({ body: refreshTokenSchema }), authController.putAuthentication);

/**
 * @openapi
 * /authentications:
 *   delete:
 *     summary: Logout user
 *     tags: [Authentications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout berhasil
 */
router.delete('/', validate({ body: refreshTokenSchema }), authController.deleteAuthentication);


module.exports = router;