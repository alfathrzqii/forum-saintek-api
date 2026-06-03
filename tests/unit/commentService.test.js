const commentService = require('../../src/services/commentService');
const commentRepository = require('../../src/repositories/commentRepository');
const threadRepository = require('../../src/repositories/threadRepository');
const NotFoundError = require('../../src/exceptions/NotFoundError');

jest.mock('../../src/repositories/commentRepository');
jest.mock('../../src/repositories/threadRepository');
jest.mock('../../src/utils/prisma', () => ({
  $transaction: jest.fn((callback) => callback('tx_client')),
}));

describe('commentService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const context = { userId: 'user-1' };

  describe('createComment', () => {
    it('should throw NotFoundError when threadId not found', async () => {
      // Arrange
      const data = { content: 'Nice!', threadId: 'invalid' };
      threadRepository.getThreadById.mockResolvedValue(null);

      // Action & Assert
      await expect(commentService.createComment(context, data))
        .rejects.toThrow(NotFoundError);
      expect(threadRepository.getThreadById).toHaveBeenCalledWith(data.threadId, 'tx_client');
    });

    it('should throw NotFoundError when parentId not found', async () => {
      // Arrange
      const data = { content: 'Nice!', threadId: 't-1', parentId: 'p-1' };
      threadRepository.getThreadById.mockResolvedValue({ id: 't-1' });
      commentRepository.getCommentById.mockResolvedValue(null);

      // Action & Assert
      await expect(commentService.createComment(context, data))
        .rejects.toThrow(NotFoundError);
      expect(threadRepository.getThreadById).toHaveBeenCalledWith(data.threadId, 'tx_client');
      expect(commentRepository.getCommentById).toHaveBeenCalledWith(data.parentId, 'tx_client');
    });

    it('should return created comment when data is valid', async () => {
      // Arrange
      const data = { content: 'Nice!', threadId: 't-1' };
      const expectedComment = { id: 'c-1', ...data, authorId: 'user-1' };
      threadRepository.getThreadById.mockResolvedValue({ id: 't-1' });
      commentRepository.createComment.mockResolvedValue(expectedComment);

      // Action
      const result = await commentService.createComment(context, data);

      // Assert
      expect(result).toEqual(expectedComment);
      expect(threadRepository.getThreadById).toHaveBeenCalledWith(data.threadId, 'tx_client');
      expect(commentRepository.createComment).toHaveBeenCalledWith({
        content: data.content,
        threadId: data.threadId,
        parentId: undefined,
        authorId: context.userId
      }, 'tx_client');
    });
  });

  describe('getThreadComments', () => {
    it('should return comments in a tree structure', async () => {
      // Arrange
      const flatComments = [
        { id: '1', content: 'Root 1', parentId: null },
        { id: '2', content: 'Reply to 1', parentId: '1' },
        { id: '3', content: 'Root 2', parentId: null },
        { id: '4', content: 'Reply to 2', parentId: '2' }
      ];
      commentRepository.getCommentsByThread.mockResolvedValue(flatComments);

      // Action
      const result = await commentService.getThreadComments(context, 't-1');

      // Assert
      expect(result.length).toBe(2);
      expect(result[0].id).toBe('1');
      expect(result[0].replies.length).toBe(1);
      expect(result[0].replies[0].id).toBe('2');
      expect(result[0].replies[0].replies.length).toBe(1);
      expect(result[0].replies[0].replies[0].id).toBe('4');
      expect(result[1].id).toBe('3');
      expect(result[1].replies.length).toBe(0);
    });
  });
});
