const userService = require('../../src/services/userService');
const userRepository = require('../../src/repositories/userRepository');
const bcrypt = require('bcrypt');
const InvariantError = require('../../src/exceptions/InvariantError');

jest.mock('../../src/repositories/userRepository');
jest.mock('bcrypt');
jest.mock('../../src/utils/prisma', () => ({
  $transaction: jest.fn((callback) => callback('tx_client')),
}));

describe('userService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const context = { userId: 'admin-1', role: 'ADMIN' };

  describe('register', () => {
    it('should throw InvariantError when email already exists', async () => {
      // Arrange
      const userData = { email: 'test@example.com', username: 'testuser', password: 'password123' };
      userRepository.findUserByEmail.mockResolvedValue({ id: '1', email: 'test@example.com' });

      // Action & Assert
      await expect(userService.register(context, userData))
        .rejects.toThrow(InvariantError);
      expect(userRepository.findUserByEmail).toHaveBeenCalledWith(userData.email, 'tx_client');
    });

    it('should throw InvariantError when username already exists', async () => {
      // Arrange
      const userData = { email: 'test@example.com', username: 'testuser', password: 'password123' };
      userRepository.findUserByEmail.mockResolvedValue(null);
      userRepository.findUserByUsername.mockResolvedValue({ id: '1', username: 'testuser' });

      // Action & Assert
      await expect(userService.register(context, userData))
        .rejects.toThrow(InvariantError);
      expect(userRepository.findUserByUsername).toHaveBeenCalledWith(userData.username, 'tx_client');
    });

    it('should return created user when data is valid', async () => {
      // Arrange
      const userData = { 
        email: 'new@example.com', 
        username: 'newuser', 
        password: 'password123',
        fullName: 'New User',
        prodi: 'Informatika'
      };
      const hashedPassword = 'hashedPassword123';
      const expectedUser = { 
        id: '2', 
        email: 'new@example.com', 
        username: 'newuser', 
        fullName: 'New User',
        prodi: 'Informatika',
        role: 'USER'
      };

      userRepository.findUserByEmail.mockResolvedValue(null);
      userRepository.findUserByUsername.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue(hashedPassword);
      userRepository.createUser.mockResolvedValue(expectedUser);

      // Action
      const result = await userService.register(context, userData);

      // Assert
      expect(result).toEqual(expectedUser);
      expect(userRepository.findUserByEmail).toHaveBeenCalledWith(userData.email, 'tx_client');
      expect(userRepository.findUserByUsername).toHaveBeenCalledWith(userData.username, 'tx_client');
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, 10);
      expect(userRepository.createUser).toHaveBeenCalledWith({
        ...userData,
        password: hashedPassword,
        role: 'USER'
      }, 'tx_client');
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      // Arrange
      const expectedUsers = [
        { id: '1', username: 'user1' },
        { id: '2', username: 'user2' }
      ];
      userRepository.findAllUsers.mockResolvedValue(expectedUsers);

      // Action
      const result = await userService.getAllUsers(context);

      // Assert
      expect(result).toEqual(expectedUsers);
      expect(userRepository.findAllUsers).toHaveBeenCalled();
    });
  });
});
