const authenticationService = require('../../services/authenticationService');
const { loginSchema, refreshTokenSchema } = require('../../validators/authenticationValidator');

const postAuthentication = async (req, res) => {
  try {
    const payload = loginSchema.parse(req.body);
    const { accessToken, refreshToken } = await authenticationService.login(payload);

    res.status(201).json({
      status: 'success',
      message: 'Authentication berhasil ditambahkan',
      data: { accessToken, refreshToken }
    });
  } catch (error) {
    const message = error.errors ? error.errors[0].message : error.message;
    const statusCode = message === 'Kredensial tidak valid' ? 401 : 400;
    res.status(statusCode).json({ status: 'error', message });
  }
};

const putAuthentication = async (req, res) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const accessToken = await authenticationService.refresh(refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Access Token berhasil diperbarui',
      data: { accessToken }
    });
  } catch (error) {
    const message = error.errors ? error.errors[0].message : error.message;
    res.status(400).json({ status: 'error', message });
  }
};

const deleteAuthentication = async (req, res) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    await authenticationService.logout(refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Refresh token berhasil dihapus (Logout berhasil)'
    });
  } catch (error) {
    const message = error.errors ? error.errors[0].message : error.message;
    res.status(400).json({ status: 'error', message });
  }
};

module.exports = {
  postAuthentication,
  putAuthentication,
  deleteAuthentication
};