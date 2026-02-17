const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');

const registerUser = async (userData) => {
  // 1. Cek apakah user sudah ada
  const existingUser = await userRepository.findUserByEmail(userData.email);
  if (existingUser) {
    throw new Error('Email sudah terdaftar');
  }

  // 2. Hash password (keamanan tingkat tinggi)
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  // 3. Simpan ke database
  return await userRepository.createUser({
    ...userData,
    password: hashedPassword
  });
};

module.exports = {
  registerUser
};