const voteService = require('../../src/services/voteService');
const voteRepository = require('../../src/repositories/voteRepository');

jest.mock('../../src/repositories/voteRepository');
jest.mock('../../src/utils/prisma', () => ({
  $transaction: jest.fn((callback) => callback('tx_client')),
}));

describe('voteService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const context = { userId: 'user-1' };

  describe('toggleVote', () => {
    it('should delete vote when existing vote has the same type (Toggle Off)', async () => {
      // Arrange
      const voteData = { type: 'UP', threadId: 'thread-1' };
      const existingVote = { id: 'vote-1', type: 'UP', userId: 'user-1', threadId: 'thread-1' };
      voteRepository.getExistingVote.mockResolvedValue(existingVote);

      // Action
      const result = await voteService.toggleVote(context, voteData);

      // Assert
      expect(result).toEqual({ action: 'deleted' });
      expect(voteRepository.getExistingVote).toHaveBeenCalledWith(context.userId, { threadId: 'thread-1', commentId: undefined }, 'tx_client');
      expect(voteRepository.deleteVote).toHaveBeenCalledWith(existingVote.id, 'tx_client');
    });

    it('should update vote type when existing vote has different type', async () => {
      // Arrange
      const voteData = { type: 'DOWN', threadId: 'thread-1' };
      const existingVote = { id: 'vote-1', type: 'UP', userId: 'user-1', threadId: 'thread-1' };
      voteRepository.getExistingVote.mockResolvedValue(existingVote);

      // Action
      const result = await voteService.toggleVote(context, voteData);

      // Assert
      expect(result).toEqual({ action: 'updated' });
      expect(voteRepository.getExistingVote).toHaveBeenCalledWith(context.userId, { threadId: 'thread-1', commentId: undefined }, 'tx_client');
      expect(voteRepository.updateVoteType).toHaveBeenCalledWith(existingVote.id, 'DOWN', 'tx_client');
    });

    it('should create new vote when no existing vote found', async () => {
      // Arrange
      const voteData = { type: 'UP', commentId: 'comment-1' };
      voteRepository.getExistingVote.mockResolvedValue(null);

      // Action
      const result = await voteService.toggleVote(context, voteData);

      // Assert
      expect(result).toEqual({ action: 'created' });
      expect(voteRepository.getExistingVote).toHaveBeenCalledWith(context.userId, { threadId: undefined, commentId: 'comment-1' }, 'tx_client');
      expect(voteRepository.upsertVote).toHaveBeenCalledWith(context.userId, voteData, 'tx_client');
    });
  });
});
