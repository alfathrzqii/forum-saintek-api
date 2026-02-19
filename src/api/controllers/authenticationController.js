const authenticationService = require('../../services/authenticationService');
const { loginSchema, refreshTokenSchema } = require('../../validators/authenticationValidator');

const postAuthentication = async (req, res, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const { accessToken, refreshToken } = await authenticationService.login(payload);

    res.status(201).json({
      status: 'success',
      message: 'Authentication berhasil ditambahkan',
      data: { accessToken, refreshToken }
    });
  } catch (error) {
    next(error)
  }
};

const putAuthentication = async (req, res, next) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const accessToken = await authenticationService.refresh(refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Access Token berhasil diperbarui',
      data: { accessToken }
    });
  } catch (error) {
    next(error)
  }
};

const deleteAuthentication = async (req, res, next) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authenticationService.logout(refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Refresh token berhasil dihapus (Logout berhasil)'
    });
  } catch (error) {
    next(error)
  }
};

module.exports = {
  postAuthentication,
  putAuthentication,
  deleteAuthentication
};