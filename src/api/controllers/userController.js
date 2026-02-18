const userService = require('../../services/userService');
const { createUserSchema } = require('../../validators/userValidator');

const postUser = async (req, res) => {
  try {
    const payload = createUserSchema.parse(req.body);
    const user = await userService.register(payload);

    res.status(201).json({
      status: 'success',
      message: 'User berhasil didaftarkan',
      data: user
    });
  } catch (error) {
    const message = error.errors ? error.errors[0].message : error.message;
    res.status(400).json({ status: 'error', message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.status(200).json({
      status: 'success',
      data: users
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

module.exports = { postUser, getAllUsers };