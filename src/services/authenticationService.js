const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');
const authRepository = require('../repositories/authenticationRepository');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_KEY, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_KEY, { expiresIn: '7d' });
  return { accessToken, refreshToken };
};

const login = async ({ email, password }) => {
  const user = await userRepository.findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error('Kredensial tidak valid');
  }

  const payload = { id: user.id, role: user.role, prodi: user.prodi };
  const { accessToken, refreshToken } = generateTokens(payload);

  // Simpan refreshToken ke DB
  await authRepository.addToken(refreshToken);

  return { accessToken, refreshToken };
};

const refresh = async (refreshToken) => {
  // 1. Cek apakah token ada di DB
  const tokenInDb = await authRepository.checkToken(refreshToken);
  if (!tokenInDb) throw new Error('Refresh token tidak valid');

  try {
    // 2. Verifikasi token
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_KEY);
    
    // 3. Buat Access Token baru
    const newAccessToken = jwt.sign(
      { id: payload.id, role: payload.role, prodi: payload.prodi },
      process.env.ACCESS_TOKEN_KEY,
      { expiresIn: '15m' }
    );

    return newAccessToken;
  } catch (error) {
    throw new Error('Refresh token kadaluarsa');
  }
};

const logout = async (refreshToken) => {
  await authRepository.checkToken(refreshToken);
  await authRepository.deleteToken(refreshToken);
};

module.exports = { login, refresh, logout };