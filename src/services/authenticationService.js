const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config');
const userRepository = require('../repositories/userRepository');
const authRepository = require('../repositories/authenticationRepository');

const AuthenticationError = require('../exceptions/AuthenticationError');
const InvariantError = require('../exceptions/InvariantError');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, config.jwt.accessTokenKey, { expiresIn: config.jwt.accessTokenAge });
  const refreshToken = jwt.sign(payload, config.jwt.refreshTokenKey, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const login = async (context, { email, password }) => {
  const user = await userRepository.findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new AuthenticationError('Kredensial tidak valid');
  }

  const payload = { id: user.id, role: user.role, prodi: user.prodi };
  const { accessToken, refreshToken } = generateTokens(payload);

  // Simpan refreshToken ke DB
  await authRepository.addToken(refreshToken);

  return { accessToken, refreshToken };
};

const refresh = async (context, refreshToken) => {
  // 1. Cek apakah token ada di DB
  const tokenInDb = await authRepository.checkToken(refreshToken);
  if (!tokenInDb) throw new InvariantError('Refresh token tidak valid');

  try {
    // 2. Verifikasi token
    const payload = jwt.verify(refreshToken, config.jwt.refreshTokenKey);
    
    // 3. Buat Access Token baru
    const newAccessToken = jwt.sign(
      { id: payload.id, role: payload.role, prodi: payload.prodi },
      config.jwt.accessTokenKey,
      { expiresIn: '15m' }
    );

    return newAccessToken;
  } catch (error) {
    throw new AuthenticationError('Refresh token kadaluarsa');
  }
};

const logout = async (context, refreshToken) => {
  const tokenInDb = await authRepository.checkToken(refreshToken);
  if (!tokenInDb) throw new InvariantError('Refresh token tidak valid');
  await authRepository.deleteToken(refreshToken);
};

module.exports = { login, refresh, logout };