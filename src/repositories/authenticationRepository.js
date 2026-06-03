const prisma = require('../utils/prisma');

const addToken = async (token, tx = prisma) => {
  return await tx.authentication.create({
    data: { token }
  });
};

const checkToken = async (token, tx = prisma) => {
  return await tx.authentication.findUnique({
    where: { token }
  });
};

const deleteToken = async (token, tx = prisma) => {
  return await tx.authentication.delete({
    where: { token }
  });
};

module.exports = {
  addToken,
  checkToken,
  deleteToken
};