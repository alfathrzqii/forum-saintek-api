const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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

const loginUser = async (credentials) => {
  // 1. Cari user berdasarkan email
  const user = await userRepository.findUserByEmail(credentials.email);
  if (!user) {
    throw new Error('Email atau password salah');
  }

  // 2. Bandingkan password (input vs database)
  const isPasswordMatch = await bcrypt.compare(credentials.password, user.password);
  if (!isPasswordMatch) {
    throw new Error('Email atau password salah');
  }

  // 3. Buat JWT Token
  const token = jwt.sign(
    { userId: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '1d' } // Token berlaku selama 1 hari
  );

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    },
    token
  };
};

module.exports = {
  registerUser,
  loginUser
};