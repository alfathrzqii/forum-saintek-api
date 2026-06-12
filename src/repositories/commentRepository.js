const prisma = require('../utils/prisma');

const mapCommentAuthor = (comment) => {
  if (comment && comment.thread && comment.thread.isAnonymous) {
    const anonymized = {
      ...comment,
      authorId: null,
      author: {
        username: 'Saintekfess User',
        fullName: 'Anonymous',
      },
    };
    delete anonymized.thread;
    return anonymized;
  }
  if (comment && comment.thread) delete comment.thread;
  return comment;
};

const createComment = async (data, tx = prisma) => {
  const comment = await tx.comment.create({
    data,
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      parentId: true,
      threadId: true,
      author: { select: { username: true, fullName: true } },
      thread: { select: { isAnonymous: true } }
    }
  });
  return mapCommentAuthor(comment);
};

const getCommentsByThread = async (threadId, tx = prisma) => {
  const comments = await tx.comment.findMany({
    where: { threadId },
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      parentId: true,
      author: { select: { username: true, fullName: true } },
      _count: { select: { votes: true } },
      thread: { select: { isAnonymous: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
  return comments.map(mapCommentAuthor);
};

const getCommentById = async (id, tx = prisma) => {
  return await tx.comment.findUnique({
    where: { id }
  });
};

module.exports = { createComment, getCommentsByThread, getCommentById };