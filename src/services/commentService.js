const commentRepository = require('../repositories/commentRepository');
const threadRepository = require('../repositories/threadRepository');
const NotFoundError = require('../exceptions/NotFoundError');

const createComment = async (context, { content, threadId, parentId }) => {
  const { userId } = context;
  // 1. Pastikan thread ada
  const thread = await threadRepository.getThreadById(threadId);
  if (!thread) throw new NotFoundError('Thread tidak ditemukan');

  // 2. Jika ini balasan (reply), pastikan parent comment ada
  if (parentId) {
    const parent = await commentRepository.getCommentById(parentId);
    if (!parent) throw new NotFoundError('Komentar induk tidak ditemukan');
  }

  return await commentRepository.createComment({
    content,
    threadId,
    parentId,
    authorId: userId
  });
};

const getThreadComments = async (threadId) => {
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