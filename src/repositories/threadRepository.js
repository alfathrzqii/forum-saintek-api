const prisma = require('../utils/prisma');

const createThread = async (data) => {
  return await prisma.thread.create({
    data,
    include: {
      author: {
        select: { username: true, fullName: true }
      },
      subforum: {
        select: { name: true }
      }
    }
  });
};

const getThreads = async (filters = {}) => {
  return await prisma.thread.findMany({
    where: filters,
    include: {
      author: {
        select: { username: true, fullName: true }
      },
      subforum: {
        select: { name: true, slug: true }
      },
      _count: {
        select: { comments: true, votes: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const getThreadById = async (id) => {
  return await prisma.thread.findUnique({
    where: { id },
    include: {
      author: {
        select: { id: true, username: true, fullName: true, prodi: true }
      },
      subforum: {
        select: { name: true, slug: true }
      }
    }
  });
};

const deleteThread = async (id) => {
  return await prisma.thread.delete({
    where: { id }
  });
};

module.exports = {
  createThread,
  getThreads,
  getThreadById,
  deleteThread
};