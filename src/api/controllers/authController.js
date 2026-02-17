const authService = require('../../services/authService');
const { registerSchema } = require('../../validators/authValidator');

const register = async (req, res) => {
  try {
    // Validasi input
    const validatedData = registerSchema.parse(req.body);

    const user = await authService.registerUser(validatedData);

    res.status(201).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error(error)
    // Jika error dari Zod, ambil pesannya saja
    const message = error.errors ? error.errors[0].message : error.message;
    res.status(400).json({
      status: 'error',
      message: message
    });
  }
};

module.exports = {
  register
};