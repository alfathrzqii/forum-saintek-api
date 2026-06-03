const commentRepository = require('../repositories/commentRepository');
const threadRepository = require('../repositories/threadRepository');
const NotFoundError = require('../exceptions/NotFoundError');

const prisma = require('../utils/prisma');

const createComment = async (context, { content, threadId, parentId }) => {
  const { userId } = context;

  return await prisma.$transaction(async (tx) => {
    // 1. Pastikan thread ada
    const thread = await threadRepository.getThreadById(threadId, tx);
    if (!thread) throw new NotFoundError('Thread tidak ditemukan');

    // 2. Jika ini balasan (reply), pastikan parent comment ada
    if (parentId) {
      const parent = await commentRepository.getCommentById(parentId, tx);
      if (!parent) throw new NotFoundError('Komentar induk tidak ditemukan');
    }

    return await commentRepository.createComment({
      content,
      threadId,
      parentId,
      authorId: userId
    }, tx);
  });
};

const getThreadComments = async (context, threadId) => {
  const allComments = await commentRepository.getCommentsByThread(threadId);

  // Algoritma mengubah array FLAT menjadi TREE (Struktur Pohon)
  const commentMap = {};
  const rootComments = [];

  allComments.forEach(comment => {
    comment.replies = [];
    commentMap[comment.id] = comment;
    
    if (!comment.parentId) {
      rootComments.push(comment);
    } else {
      const parent = commentMap[comment.parentId];
      if (parent) {
        parent.replies.push(comment);
      }
    }
  });

  return rootComments;
};

module.exports = { createComment, getThreadComments };