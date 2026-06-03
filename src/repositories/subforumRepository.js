const prisma = require('../utils/prisma');

const createSubforum = async (data, tx = prisma) => {
  return await tx.subforum.create({
    data,
  });
};

const getSubforumByName = async (name, tx = prisma) => {
  return await tx.subforum.findUnique({
    where: { name },
  });
};

const getSubforumBySlug = async (slug, tx = prisma) => {
  return await tx.subforum.findUnique({
    where: { slug },
    include: {
      _count: {
        select: { threads: true } // Menghitung jumlah thread di dalamnya
      }
    }
  });
};

const getAllSubforums = async (tx = prisma) => {
  return await tx.subforum.findMany({
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