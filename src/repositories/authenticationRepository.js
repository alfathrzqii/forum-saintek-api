const prisma = require('../utils/prisma');

const addToken = async (token) => {
  return await prisma.authentication.create({
    data: { token }
  });
};

const checkToken = async (token) => {
  return await prisma.authentication.findUnique({
    where: { token }
  });
};

const deleteToken = async (token) => {
  return await prisma.authentication.delete({
    where: { token }
  });
};

module.exports = {
  addToken,
  checkToken,
  deleteToken
};