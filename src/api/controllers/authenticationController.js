const authenticationService = require('../../services/authenticationService');
const { successResponse } = require('../../utils/response');

const postAuthentication = async (req, res, next) => {
  try {
    const context = {};
    const { identifier, password } = req.body;
    const { accessToken, refreshToken } = await authenticationService.login(context, { identifier, password });

    return successResponse(res, 'Authentication berhasil ditambahkan', { accessToken, refreshToken }, 201);
  } catch (error) {
    next(error)
  }
};

const putAuthentication = async (req, res, next) => {
  try {
    const context = {};
    const { refreshToken } = req.body;
    const accessToken = await authenticationService.refresh(context, refreshToken);

    return successResponse(res, 'Access Token berhasil diperbarui', { accessToken });
  } catch (error) {
    next(error)
  }
};

const deleteAuthentication = async (req, res, next) => {
  try {
    const context = {};
    const { refreshToken } = req.body;
    await authenticationService.logout(context, refreshToken);

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