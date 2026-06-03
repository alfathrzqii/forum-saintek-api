const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authenticationMiddleware = require('../middlewares/authenticationMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { successResponse } = require('../../utils/response');

/**
 * @openapi
 * tags:
 *   name: Users
 *   description: API untuk manajemen user dan profil
 */

/**
 * @openapi
 * /api/users:
 *   post:
 *     summary: Registrasi user baru
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - username
 *               - password
 *               - fullName
 *               - prodi
 *             properties:
 *               email:
 *                 type: string
 *                 example: mhs123@student.uin-suka.ac.id
 *               username:
 *                 type: string
 *                 example: mhs_keren
 *               password:
 *                 type: string
 *                 example: Password123!
 *               fullName:
 *                 type: string
 *                 example: Mahasiswa Saintek
 *               prodi:
 *                 type: string
 *                 example: Informatika
 *     responses:
 *       201:
 *         description: User berhasil dibuat
 *       400:
 *         description: Email atau Username sudah digunakan
 */
router.post('/', userController.postUser);

/**
 * @openapi
 * /api/users/me:
 *   get:
 *     summary: Mendapatkan profil user yang sedang login
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil berhasil dimuat
 *       401:
 *         description: Unauthorized
 */
router.get('/me', authenticationMiddleware, (req, res) => {
  return successResponse(res, 'Profil berhasil dimuat', req.user);
});

/**
 * @openapi
 * /api/users:
 *   get:
 *     summary: Mendapatkan semua daftar user (Hanya Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Daftar user berhasil dimuat
 *       403:
 *         description: Forbidden (Bukan Admin)
 */
router.get('/', authenticationMiddleware, roleMiddleware(['ADMIN']), userController.getAllUsers);

module.exports = router;