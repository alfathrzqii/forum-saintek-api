const authenticationService = require('../../services/authenticationService');
const { successResponse } = require('../../utils/response');

const postAuthentication = async (req, res, next) => {
  try {
    const { accessToken, refreshToken } = await authenticationService.login(req.body);

    return successResponse(res, 'Authentication berhasil ditambahkan', { accessToken, refreshToken }, 201);
  } catch (error) {
    next(error)
  }
};

const putAuthentication = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const accessToken = await authenticationService.refresh(refreshToken);

    return successResponse(res, 'Access Token berhasil diperbarui', { accessToken });
  } catch (error) {
    next(error)
  }
};

const deleteAuthentication = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authenticationService.logout(refreshToken);

    return successResponse(res, 'Refresh token berhasil dihapus (Logout berhasil)');
  } catch (error) {
    next(error)
  }
};


module.exports = {
  postAuthentication,
  putAuthentication,
  deleteAuthentication
};