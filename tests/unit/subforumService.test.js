const subforumService = require('../../src/services/subforumService');
const subforumRepository = require('../../src/repositories/subforumRepository');
const InvariantError = require('../../src/exceptions/InvariantError');
const NotFoundError = require('../../src/exceptions/NotFoundError');

jest.mock('../../src/repositories/subforumRepository');
jest.mock('../../src/utils/prisma', () => ({
  $transaction: jest.fn((callback) => callback('tx_client')),
}));

describe('subforumService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const context = { userId: 'admin-1', role: 'ADMIN' };

  describe('createSubforum', () => {
    it('should throw InvariantError when subforum name already exists', async () => {
      // Arrange
      const data = { name: 'Sains Data', description: 'Test' };
      subforumRepository.getSubforumByName.mockResolvedValue({ id: '1', name: 'Sains Data' });

      // Action & Assert
      await expect(subforumService.createSubforum(context, data))
        .rejects.toThrow(InvariantError);
      expect(subforumRepository.getSubforumByName).toHaveBeenCalledWith(data.name, 'tx_client');
    });

    it('should return created subforum when data is valid', async () => {
      // Arrange
      const data = { name: 'Informatika', description: 'Test' };
      const expectedSubforum = { id: '2', name: 'Informatika', slug: 'informatika', description: 'Test' };
      
      subforumRepository.getSubforumByName.mockResolvedValue(null);
      subforumRepository.createSubforum.mockResolvedValue(expectedSubforum);

      // Action
      const result = await subforumService.createSubforum(context, data);

      // Assert
      expect(result).toEqual(expectedSubforum);
      expect(subforumRepository.createSubforum).toHaveBeenCalledWith({
        name: data.name,
        slug: 'informatika',
        description: data.description,
      }, 'tx_client');
    });
  });

  describe('getSubforumBySlug', () => {
    it('should throw NotFoundError when subforum not found', async () => {
      // Arrange
      subforumRepository.getSubforumBySlug.mockResolvedValue(null);

      // Action & Assert
      await expect(subforumService.getSubforumBySlug(context, 'non-existent'))
        .rejects.toThrow(NotFoundError);
    });

    it('should return subforum when found', async () => {
      // Arrange
      const expectedSubforum = { id: '1', name: 'Sains Data', slug: 'sains-data' };
      subforumRepository.getSubforumBySlug.mockResolvedValue(expectedSubforum);

      // Action
      const result = await subforumService.getSubforumBySlug(context, 'sains-data');

      // Assert
      expect(result).toEqual(expectedSubforum);
    });
  });
});
