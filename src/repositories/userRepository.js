const prisma = require('../utils/prisma');

const findUserByEmail = async (email) => {
  return await prisma.user.findUnique({ where: { email } });
};

const findUserByUsername = async (username) => {
  return await prisma.user.findUnique({ where: { username } });
};

const findUserById = async (id) => {
  return await prisma.user.findUnique({
    where: { id },
    select: { 
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      prodi: true
    }
  });
};

const createUser = async (userData) => {
  return await prisma.user.create({
    data: userData,
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      prodi: true,
      role: true,
      createdAt: true
    }
  });
};

const findAllUsers = async () => {
  return await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      fullName: true,
      role: true,
      prodi: true,
      createdAt: true
    }
  });
};

module.exports = { 
  findUserByEmail,
  findUserByUsername,
  createUser,
  findAllUsers,
  findUserById
};