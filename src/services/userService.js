const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');

const register = async (userData) => {
  // 1. Cek duplikasi email & username
  const existingEmail = await userRepository.findUserByEmail(userData.email);
  if (existingEmail) throw new Error('Email sudah digunakan');

  const existingUsername = await userRepository.findUserByUsername(userData.username);
  if (existingUsername) throw new Error('Username sudah digunakan');

  // 2. Hashing password
  const hashedPassword = await bcrypt.hash(userData.password, 10);

  // 3. Simpan
  return await userRepository.createUser({
    ...userData,
    password: hashedPassword,
    role: 'USER'
  });
};

const getAllUsers = async () => {
  return await userRepository.findAllUsers();
};

module.exports = { register, getAllUsers };