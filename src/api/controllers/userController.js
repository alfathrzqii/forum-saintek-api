const userService = require('../../services/userService');
const { createUserSchema } = require('../../validators/userValidator');
const { successResponse } = require('../../utils/response');

const postUser = async (req, res, next) => {
  try {
    const context = { userId: req.user?.id, role: req.user?.role };
    const payload = createUserSchema.parse(req.body);
    const user = await userService.register(context, payload);

    return successResponse(res, 'User berhasil didaftarkan', user, 201);
  } catch (error) {
    next(error)
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const context = { userId: req.user?.id, role: req.user?.role };
    const users = await userService.getAllUsers(context);
    return successResponse(res, 'Daftar user berhasil dimuat', users);
  } catch (error) {
    next(error)
  }
};

module.exports = { postUser, getAllUsers };