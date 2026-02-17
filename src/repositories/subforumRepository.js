const prisma = require('../utils/prisma');

const getAllSubforums = async () => {
  // Hanya ambil data dari tabel subforum
  return await prisma.subforum.findMany();
};

module.exports = {
  getAllSubforums
};