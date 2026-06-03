const threadRepository = require('../repositories/threadRepository');
const subforumRepository = require('../repositories/subforumRepository');
const NotFoundError = require('../exceptions/NotFoundError');
const AuthenticationError = require('../exceptions/AuthenticationError');
const AuthorizationError = require('../exceptions/AuthorizationError');

const prisma = require('../utils/prisma');

const createThread = async (context, { title, content, subforumSlug, isAnonymous, imageUrl }) => {
  const { userId } = context;

  return await prisma.$transaction(async (tx) => {
    const subforum = await subforumRepository.getSubforumBySlug(subforumSlug, tx);

    if (!subforum) throw new NotFoundError('Subforum tidak ditemukan');

    return await threadRepository.createThread({
      title,
      content,
      isAnonymous: isAnonymous || false,
      imageUrl: imageUrl || null,
      authorId: userId,
      subforumId: subforum.id
    }, tx);
  });
};

const getAllThreads = async (context, subforumSlug) => {
  let filters = {};
  
  if (subforumSlug) {
    const subforum = await subforumRepository.getSubforumBySlug(subforumSlug);
    if (subforum) filters.subforumId = subforum.id;
  }

  return await threadRepository.getThreads(filters);
};

const getThreadById = async (context, id) => {
  const thread = await threadRepository.getThreadById(id);
  if (!thread) throw new NotFoundError('Thread tidak ditemukan');
  return thread;
};


const deleteThread = async (context, threadId) => {
  const { userId, role } = context;

  return await prisma.$transaction(async (tx) => {
    const thread = await threadRepository.getThreadById(threadId, tx);
    if (!thread) throw new NotFoundError('Thread tidak ditemukan');

    if (thread.authorId !== userId && role !== 'ADMIN') {
      throw new AuthorizationError('Anda tidak berhak menghapus thread ini');
    }

    return await threadRepository.deleteThread(threadId, tx);
  });
};

module.exports = {
  createThread,
  getAllThreads,
  getThreadById,
  deleteThread
};