const prisma = require('../utils/prisma');

const mapThreadAuthor = (thread) => {
  if (thread && thread.isAnonymous) {
    return {
      ...thread,
      author: {
        ...thread.author,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      },
    };
  }
  return thread;
};

const createThread = async (data) => {
  const thread = await prisma.thread.create({
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
  return mapThreadAuthor(thread);
};

const getThreads = async (filters = {}) => {
  const threads = await prisma.thread.findMany({
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
  return threads.map(mapThreadAuthor);
};

const getThreadById = async (id) => {
  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      author: {
        select: { id: true, username: true, fullName: true, prodi: true }
      },
      subforum: {
        select: { name: true, slug: true }
      },
      _count: {
        select: { comments: true, votes: true }
      }
    }
  });
  return mapThreadAuthor(thread);
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