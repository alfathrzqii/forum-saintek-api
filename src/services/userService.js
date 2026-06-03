const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const InvariantError = require('../exceptions/InvariantError');

const prisma = require('../utils/prisma');

const register = async (context, userData) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Cek duplikasi email & username
    const existingEmail = await userRepository.findUserByEmail(userData.email, tx);
    if (existingEmail) throw new InvariantError('Email sudah digunakan');

    const existingUsername = await userRepository.findUserByUsername(userData.username, tx);
    if (existingUsername) throw new InvariantError('Username sudah digunakan');

    // 2. Hashing password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // 3. Simpan
    return await userRepository.createUser({
      ...userData,
      password: hashedPassword,
      role: 'USER'
    }, tx);
  });
};

const getAllUsers = async (context) => {
  return await userRepository.findAllUsers();
};

module.exports = { register, getAllUsers };