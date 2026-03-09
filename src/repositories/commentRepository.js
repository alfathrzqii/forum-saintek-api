const prisma = require('../utils/prisma');

const createComment = async (data) => {
  return await prisma.comment.create({
    data,
    include: {
      author: { select: { username: true, fullName: true } }
    }
  });
};

const getCommentsByThread = async (threadId) => {
  return await prisma.comment.findMany({
    where: { threadId },
    include: {
      author: { select: { username: true, fullName: true } },
      _count: { select: { votes: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
};

const getCommentById = async (id) => {
  return await prisma.comment.findUnique({
    where: { id }
  });
};

module.exports = { createComment, getCommentsByThread, getCommentById };