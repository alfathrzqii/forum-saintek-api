const threadService = require('../../src/services/threadService');
const threadRepository = require('../../src/repositories/threadRepository');
const subforumRepository = require('../../src/repositories/subforumRepository');
const NotFoundError = require('../../src/exceptions/NotFoundError');
const AuthorizationError = require('../../src/exceptions/AuthorizationError');

jest.mock('../../src/repositories/threadRepository');
jest.mock('../../src/repositories/subforumRepository');

describe('threadService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const context = { userId: 'user-1', role: 'USER' };

  describe('createThread', () => {
    it('should throw NotFoundError when subforumSlug not found', async () => {
      // Arrange
      const data = { title: 'Test', content: 'Test', subforumSlug: 'invalid' };
      subforumRepository.getSubforumBySlug.mockResolvedValue(null);

      // Action & Assert
      await expect(threadService.createThread(context, data))
        .rejects.toThrow(NotFoundError);
    });

    it('should return created thread when data is valid', async () => {
      // Arrange
      const data = { title: 'Test', content: 'Test', subforumSlug: 'sains-data', isAnonymous: true };
      const subforum = { id: 'sf-1', name: 'Sains Data' };
      const expectedThread = { id: 't-1', ...data, authorId: 'user-1', subforumId: 'sf-1' };

      subforumRepository.getSubforumBySlug.mockResolvedValue(subforum);
      threadRepository.createThread.mockResolvedValue(expectedThread);

      // Action
      const result = await threadService.createThread(context, data);

      // Assert
      expect(result).toEqual(expectedThread);
      expect(threadRepository.createThread).toHaveBeenCalledWith({
        title: data.title,
        content: data.content,
        isAnonymous: true,
        imageUrl: null,
        authorId: context.userId,
        subforumId: subforum.id
      });
    });
  });

  describe('getAllThreads', () => {
    it('should return all threads with filters when subforumSlug is provided', async () => {
      // Arrange
      const subforum = { id: 'sf-1', slug: 'sains-data' };
      const expectedThreads = [{ id: 't-1', title: 'Thread 1' }];
      subforumRepository.getSubforumBySlug.mockResolvedValue(subforum);
      threadRepository.getThreads.mockResolvedValue(expectedThreads);

      // Action
      const result = await threadService.getAllThreads('sains-data');

      // Assert
      expect(result).toEqual(expectedThreads);
      expect(threadRepository.getThreads).toHaveBeenCalledWith({ subforumId: 'sf-1' });
    });

    it('should return all threads without filters when subforumSlug is NOT provided', async () => {
      // Arrange
      const expectedThreads = [{ id: 't-1', title: 'Thread 1' }];
      threadRepository.getThreads.mockResolvedValue(expectedThreads);

      // Action
      const result = await threadService.getAllThreads();

      // Assert
      expect(result).toEqual(expectedThreads);
      expect(threadRepository.getThreads).toHaveBeenCalledWith({});
    });
  });

  describe('deleteThread', () => {
    it('should throw NotFoundError when thread not found', async () => {
      // Arrange
      threadRepository.getThreadById.mockResolvedValue(null);

      // Action & Assert
      await expect(threadService.deleteThread('t-1', context))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw AuthorizationError when user is not author and not ADMIN', async () => {
      // Arrange
      const thread = { id: 't-1', authorId: 'other-user' };
      threadRepository.getThreadById.mockResolvedValue(thread);

      // Action & Assert
      await expect(threadService.deleteThread('t-1', context))
        .rejects.toThrow(AuthorizationError);
    });

    it('should delete thread when user is author', async () => {
      // Arrange
      const thread = { id: 't-1', authorId: 'user-1' };
      threadRepository.getThreadById.mockResolvedValue(thread);

      // Action
      await threadService.deleteThread('t-1', context);

      // Assert
      expect(threadRepository.deleteThread).toHaveBeenCalledWith('t-1');
    });

    it('should delete thread when user is ADMIN', async () => {
      // Arrange
      const thread = { id: 't-1', authorId: 'other-user' };
      const adminContext = { userId: 'admin-1', role: 'ADMIN' };
      threadRepository.getThreadById.mockResolvedValue(thread);

      // Action
      await threadService.deleteThread('t-1', adminContext);

      // Assert
      expect(threadRepository.deleteThread).toHaveBeenCalledWith('t-1');
    });
  });
});
