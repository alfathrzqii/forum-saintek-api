const prisma = require('../utils/prisma');

const createSubforum = async (data) => {
  return await prisma.subforum.create({
    data,
  });
};

const getSubforumByName = async (name) => {
  return await prisma.subforum.findUnique({
    where: { name },
  });
};

const getSubforumBySlug = async (slug) => {
  return await prisma.subforum.findUnique({
    where: { slug },
    include: {
      _count: {
        select: { threads: true } // Menghitung jumlah thread di dalamnya
      }
    }
  });
};

const getAllSubforums = async () => {
  return await prisma.subforum.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { threads: true }
      }
    }
  });
};

module.exports = {
  createSubforum,
  getSubforumByName,
  getSubforumBySlug,
  getAllSubforums,
};