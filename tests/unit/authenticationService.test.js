const authenticationService = require('../../src/services/authenticationService');
const userRepository = require('../../src/repositories/userRepository');
const authRepository = require('../../src/repositories/authenticationRepository');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const AuthenticationError = require('../../src/exceptions/AuthenticationError');
const InvariantError = require('../../src/exceptions/InvariantError');

jest.mock('../../src/repositories/userRepository');
jest.mock('../../src/repositories/authenticationRepository');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('authenticationService Unit Test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should throw AuthenticationError when email not found', async () => {
      // Arrange
      const credentials = { email: 'non@example.com', password: 'password123' };
      userRepository.findUserByEmail.mockResolvedValue(null);

      // Action & Assert
      await expect(authenticationService.login(credentials))
        .rejects.toThrow(AuthenticationError);
    });

    it('should throw AuthenticationError when password does not match', async () => {
      // Arrange
      const credentials = { email: 'test@example.com', password: 'wrongpassword' };
      const user = { id: '1', email: 'test@example.com', password: 'hashedPassword' };
      userRepository.findUserByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(false);

      // Action & Assert
      await expect(authenticationService.login(credentials))
        .rejects.toThrow(AuthenticationError);
    });

    it('should return tokens when credentials are valid', async () => {
      // Arrange
      const credentials = { email: 'test@example.com', password: 'password123' };
      const user = { id: '1', email: 'test@example.com', password: 'hashedPassword', role: 'USER', prodi: 'IF' };
      userRepository.findUserByEmail.mockResolvedValue(user);
      bcrypt.compare.mockResolvedValue(true);
      
      jwt.sign.mockReturnValueOnce('accessToken').mockReturnValueOnce('refreshToken');

      // Action
      const result = await authenticationService.login(credentials);

      // Assert
      expect(result).toEqual({ accessToken: 'accessToken', refreshToken: 'refreshToken' });
      expect(authRepository.addToken).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('refresh', () => {
    it('should throw InvariantError when refresh token not in DB', async () => {
      // Arrange
      authRepository.checkToken.mockResolvedValue(null);

      // Action & Assert
      await expect(authenticationService.refresh('invalidToken'))
        .rejects.toThrow(InvariantError);
    });

    it('should throw AuthenticationError when token is invalid or expired', async () => {
      // Arrange
      authRepository.checkToken.mockResolvedValue({ token: 'expiredToken' });
      jwt.verify.mockImplementation(() => { throw new Error('Expired'); });

      // Action & Assert
      await expect(authenticationService.refresh('expiredToken'))
        .rejects.toThrow(AuthenticationError);
    });

    it('should return new access token when refresh token is valid', async () => {
      // Arrange
      const refreshToken = 'validRefreshToken';
      const payload = { id: '1', role: 'USER', prodi: 'IF' };
      authRepository.checkToken.mockResolvedValue({ token: refreshToken });
      jwt.verify.mockReturnValue(payload);
      jwt.sign.mockReturnValue('newAccessToken');

      // Action
      const result = await authenticationService.refresh(refreshToken);

      // Assert
      expect(result).toBe('newAccessToken');
      expect(jwt.sign).toHaveBeenCalledWith(payload, config.jwt.accessTokenKey, { expiresIn: '15m' });
    });
  });

  describe('logout', () => {
    it('should throw InvariantError when refresh token not in DB', async () => {
      // Arrange
      authRepository.checkToken.mockResolvedValue(null);

      // Action & Assert
      await expect(authenticationService.logout('invalidToken'))
        .rejects.toThrow(InvariantError);
    });

    it('should delete token from DB when refresh token is valid', async () => {
      // Arrange
      const refreshToken = 'validRefreshToken';
      authRepository.checkToken.mockResolvedValue({ token: refreshToken });

      // Action
      await authenticationService.logout(refreshToken);

      // Assert
      expect(authRepository.deleteToken).toHaveBeenCalledWith(refreshToken);
    });
  });
});
