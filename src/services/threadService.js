const threadRepository = require('../repositories/threadRepository');
const subforumRepository = require('../repositories/subforumRepository');
const NotFoundError = require('../exceptions/NotFoundError');
const AuthenticationError = require('../exceptions/AuthenticationError');
const AuthorizationError = require('../exceptions/AuthorizationError');

const createThread = async (context, { title, content, subforumSlug, isAnonymous, imageUrl }) => {
  const { userId } = context;
  const subforum = await subforumRepository.getSubforumBySlug(subforumSlug); 
  
  if (!subforum) throw new NotFoundError('Subforum tidak ditemukan');

  return await threadRepository.createThread({
    title,
    content,
    isAnonymous: isAnonymous || false,
    imageUrl: imageUrl || null,
    authorId: userId,
    subforumId: subforum.id
  });
};

const getAllThreads = async (subforumSlug) => {
  let filters = {};
  
  if (subforumSlug) {
    const subforum = await subforumRepository.getSubforumBySlug(subforumSlug);
    if (subforum) filters.subforumId = subforum.id;
  }

  return await threadRepository.getThreads(filters);
};

const getThreadById = async (id) => {
  const thread = await threadRepository.getThreadById(id);
  if (!thread) throw new NotFoundError('Thread tidak ditemukan');
  return thread;
};


const deleteThread = async (threadId, context) => {
  const { userId, role } = context;
  const thread = await threadRepository.getThreadById(threadId);
  if (!thread) throw new NotFoundError('Thread tidak ditemukan');

  if (thread.authorId !== userId && role !== 'ADMIN') {
    throw new AuthorizationError('Anda tidak berhak menghapus thread ini');
  }

  return await threadRepository.deleteThread(threadId);
};

module.exports = {
  createThread,
  getAllThreads,
  getThreadById,
  deleteThread
};