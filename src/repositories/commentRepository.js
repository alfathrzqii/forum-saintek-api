const prisma = require('../utils/prisma');

const createComment = async (data, tx = prisma) => {
  return await tx.comment.create({
    data,
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      parentId: true,
      threadId: true,
      author: { select: { username: true, fullName: true } }
    }
  });
};

const getCommentsByThread = async (threadId, tx = prisma) => {
  return await tx.comment.findMany({
    where: { threadId },
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      parentId: true,
      author: { select: { username: true, fullName: true } },
      _count: { select: { votes: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
};

const getCommentById = async (id, tx = prisma) => {
  return await tx.comment.findUnique({
    where: { id }
  });
};

module.exports = { createComment, getCommentsByThread, getCommentById };