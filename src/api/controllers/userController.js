const userService = require('../../services/userService');
const { createUserSchema } = require('../../validators/userValidator');
const { successResponse } = require('../../utils/response');

const postUser = async (req, res, next) => {
  try {
    const payload = createUserSchema.parse(req.body);
    const user = await userService.register(payload);

    return successResponse(res, 'User berhasil didaftarkan', user, 201);
  } catch (error) {
    next(error)
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    return successResponse(res, 'Daftar user berhasil dimuat', users);
  } catch (error) {
    next(error)
  }
};

module.exports = { postUser, getAllUsers };