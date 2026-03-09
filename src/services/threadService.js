const threadRepository = require('../repositories/threadRepository');
const subforumRepository = require('../repositories/subforumRepository');
const NotFoundError = require('../exceptions/NotFoundError');
const AuthenticationError = require('../exceptions/AuthenticationError');

const createThread = async (context, { title, content, subforumId, isAnonymous, imageUrl }) => {
  const { userId } = context;
  const subforum = await subforumRepository.getSubforumBySlug(subforumId); 
  
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

  const threads = await threadRepository.getThreads(filters);

  return threads.map(thread => {
    if (thread.isAnonymous) {
      return { ...thread, author: { username: 'Saintekfess User', fullName: 'Anonymous' } };
    }
    return thread;
  });
};

const deleteThread = async (threadId, context) => {
  const { userId, role } = context;
  const thread = await threadRepository.getThreadById(threadId);
  if (!thread) throw new NotFoundError('Thread tidak ditemukan');

  if (thread.authorId !== userId && role !== 'ADMIN') {
    throw new AuthenticationError('Anda tidak berhak menghapus thread ini');
  }

  return await threadRepository.deleteThread(threadId);
};

module.exports = {
  createThread,
  getAllThreads,
  deleteThread
};