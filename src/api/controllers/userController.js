const userService = require('../../services/userService');
const { createUserSchema } = require('../../validators/userValidator');

const postUser = async (req, res, next) => {
  try {
    const payload = createUserSchema.parse(req.body);
    const user = await userService.register(payload);

    res.status(201).json({
      status: 'success',
      message: 'User berhasil didaftarkan',
      data: user
    });
  } catch (error) {
    next(error)
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json({
      status: 'success',
      data: users
    });
  } catch (error) {
    next(error)
  }
};

module.exports = { postUser, getAllUsers };