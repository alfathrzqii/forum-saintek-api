const prisma = require('../utils/prisma');

const findUserByEmail = async (email, tx = prisma) => {
  return await tx.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      password: true,
      fullName: true,
      prodi: true,
      role: true
    }
  });
};

const findUserByUsername = async (username, tx = prisma) => {
  return await tx.user.findUnique({
    where: { username },
    select: {
      id: true,
      email: true,
      username: true,
      password: true,
      fullName: true,
      prodi: true,
      role: true
    }
  });
};

const findUserById = async (id, tx = prisma) => {
  return await tx.user.findUnique({
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

const createUser = async (userData, tx = prisma) => {
  return await tx.user.create({
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

const findAllUsers = async (tx = prisma) => {
  return await tx.user.findMany({
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