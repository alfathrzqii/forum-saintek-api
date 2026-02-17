const prisma = require('../utils/prisma');

const findUserByEmail = async (email) => {
  return await prisma.user.findUnique({ where: { email } });
};

const createUser = async (userData) => {
  return await prisma.user.create({
    data: userData,
    select: {
      id: true,
      email: true,
      username: true,
      prodi: true,
      createdAt: true
    }
  });
};

module.exports = {
  findUserByEmail,
  createUser
};