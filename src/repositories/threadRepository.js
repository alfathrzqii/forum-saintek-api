const prisma = require('../utils/prisma');

const mapThreadAuthor = (thread) => {
  if (thread && thread.isAnonymous) {
    return {
      ...thread,
      authorId: null,
      author: {
        ...thread.author,
        id: null,
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      },
    };
  }
  return thread;
};

const createThread = async (data, tx = prisma) => {
  const thread = await tx.thread.create({
    data,
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      isAnonymous: true,
      authorId: true,
      createdAt: true,
      author: {
        select: { username: true, fullName: true }
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

const getThreads = async (filters = {}, tx = prisma) => {
  const threads = await tx.thread.findMany({
    where: {
      ...filters,
      deletedAt: null // Hanya ambil yang belum dihapus
    },
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      isAnonymous: true,
      authorId: true,
      createdAt: true,
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

const getThreadById = async (id, tx = prisma) => {
  const thread = await tx.thread.findUnique({
    where: { 
      id,
      deletedAt: null // Pastikan thread yang sudah dihapus tidak ditemukan
    },
    select: {
      id: true,
      title: true,
      content: true,
      imageUrl: true,
      isAnonymous: true,
      authorId: true,
      createdAt: true,
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


const deleteThread = async (id, tx = prisma) => {
  return await tx.thread.update({
    where: { id },
    data: { deletedAt: new Date() } // Soft delete: isi waktu penghapusan
  });
};

module.exports = {
  createThread,
  getThreads,
  getThreadById,
  deleteThread
};