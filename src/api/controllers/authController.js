const authService = require('../../services/authService');
const { registerSchema, loginSchema } = require('../../validators/authValidator');

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
    // Jika error dari Zod, ambil pesannya saja
    const message = error.errors ? error.errors[0].message : error.message;
    res.status(400).json({
      status: 'error',
      message: message
    });
  }
};

const login = async (req, res) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await authService.loginUser(validatedData);

    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    const message = error.errors ? error.errors[0].message : error.message;
    // Gunakan 401 jika kredensial salah
    const statusCode = message === 'Email atau password salah' ? 401 : 400;
    
    res.status(statusCode).json({
      status: 'error',
      message: message
    });
  }
};

module.exports = {
  register,
  login
};