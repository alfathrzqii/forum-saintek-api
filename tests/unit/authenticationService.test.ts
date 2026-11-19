import { describe, expect, it, mock } from 'bun:test';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/forum_saintek_test';

const { AuthenticationError } = await import(
  '../../src/exceptions/AuthenticationError.ts'
);
const { InvariantError } = await import(
  '../../src/exceptions/InvariantError.ts'
);
const { createAuthenticationService } = await import(
  '../../src/services/authenticationService.ts'
);

function buildDeps(overrides: Record<string, unknown> = {}) {
  const userRepository = {
    findUserByEmail: mock(async () => null),
    findUserByUsername: mock(async () => null),
  };
  const authenticationRepository = {
    addToken: mock(async (token: string) => ({ token })),
    checkToken: mock(async () => null),
    deleteToken: mock(async () => undefined),
  };
  const password = {
    verifyPassword: mock(async () => false),
  };
  const jwt = {
    signAccessToken: mock(() => 'accessToken'),
    signRefreshToken: mock(() => 'refreshToken'),
    verifyRefreshToken: mock(() => ({
      id: '1',
      role: 'USER' as const,
      prodi: 'IF',
    })),
  };

  return {
    userRepository,
    authenticationRepository,
    password,
    jwt,
    ...overrides,
  };
}

describe('authenticationService Unit Test', () => {
  describe('login', () => {
    it('throws AuthenticationError when identifier (email/username) not found', async () => {
      const deps = buildDeps();
      const service = createAuthenticationService(deps);

      await expect(
        service.login({ identifier: 'nonexistent', password: 'password123' }),
      ).rejects.toThrow(AuthenticationError);
      expect(deps.userRepository.findUserByEmail).toHaveBeenCalledWith(
        'nonexistent',
      );
      expect(deps.userRepository.findUserByUsername).toHaveBeenCalledWith(
        'nonexistent',
      );
    });

    it('throws AuthenticationError when password does not match', async () => {
      const deps = buildDeps();
      deps.userRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        username: 'tester',
        password: 'hashedPassword',
        fullName: 'Tester',
        role: 'USER',
        prodi: 'IF',
      } as never);
      deps.password.verifyPassword.mockResolvedValue(false);

      const service = createAuthenticationService(deps);

      await expect(
        service.login({
          identifier: 'test@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(AuthenticationError);
      expect(deps.authenticationRepository.addToken).not.toHaveBeenCalled();
    });

    it('returns tokens when credentials (email) are valid and persists refresh token', async () => {
      const deps = buildDeps();
      deps.userRepository.findUserByEmail.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        username: 'tester',
        password: 'hashedPassword',
        fullName: 'Tester',
        role: 'USER',
        prodi: 'IF',
      } as never);
      deps.password.verifyPassword.mockResolvedValue(true);

      const service = createAuthenticationService(deps);
      const result = await service.login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        accessToken: 'accessToken',
        refreshToken: 'refreshToken',
      });
      expect(deps.jwt.signAccessToken).toHaveBeenCalledWith({
        id: '1',
        role: 'USER',
        prodi: 'IF',
      });
      expect(deps.jwt.signRefreshToken).toHaveBeenCalledWith({
        id: '1',
        role: 'USER',
        prodi: 'IF',
      });
      expect(deps.authenticationRepository.addToken).toHaveBeenCalledWith(
        'refreshToken',
      );
    });

    it('returns tokens when credentials (username) are valid via fallback lookup', async () => {
      const deps = buildDeps();
      deps.userRepository.findUserByEmail.mockResolvedValue(null);
      deps.userRepository.findUserByUsername.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        username: 'tester',
        password: 'hashedPassword',
        fullName: 'Tester',
        role: 'USER',
        prodi: 'IF',
      } as never);
      deps.password.verifyPassword.mockResolvedValue(true);

      const service = createAuthenticationService(deps);
      const result = await service.login({
        identifier: 'tester',
        password: 'password123',
      });

      expect(result).toEqual({
        accessToken: 'accessToken',
        refreshToken: 'refreshToken',
      });
      expect(deps.userRepository.findUserByUsername).toHaveBeenCalledWith(
        'tester',
      );
      expect(deps.authenticationRepository.addToken).toHaveBeenCalledWith(
        'refreshToken',
      );
    });
  });

  describe('refresh', () => {
    it('throws InvariantError when refresh token is not in DB', async () => {
      const deps = buildDeps();
      deps.authenticationRepository.checkToken.mockResolvedValue(null);

      const service = createAuthenticationService(deps);

      await expect(service.refresh('invalidToken')).rejects.toThrow(
        InvariantError,
      );
    });

    it('deletes token from DB and throws AuthenticationError when token is invalid or expired', async () => {
      const deps = buildDeps();
      deps.authenticationRepository.checkToken.mockResolvedValue({
        token: 'expiredToken',
      } as never);
      deps.jwt.verifyRefreshToken.mockImplementation(() => {
        throw new Error('Expired');
      });

      const service = createAuthenticationService(deps);

      await expect(service.refresh('expiredToken')).rejects.toThrow(
        AuthenticationError,
      );
      expect(deps.authenticationRepository.deleteToken).toHaveBeenCalledWith(
        'expiredToken',
      );
    });

    it('returns new access token when refresh token is valid', async () => {
      const refreshToken = 'validRefreshToken';
      const payload = { id: '1', role: 'USER' as const, prodi: 'IF' };
      const deps = buildDeps();
      deps.authenticationRepository.checkToken.mockResolvedValue({
        token: refreshToken,
      } as never);
      deps.jwt.verifyRefreshToken.mockReturnValue(payload);
      deps.jwt.signAccessToken.mockReturnValue('newAccessToken');

      const service = createAuthenticationService(deps);
      const result = await service.refresh(refreshToken);

      expect(result).toBe('newAccessToken');
      expect(deps.jwt.verifyRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(deps.jwt.signAccessToken).toHaveBeenCalledWith(payload);
    });
  });

  describe('logout', () => {
    it('throws InvariantError when refresh token is not in DB', async () => {
      const deps = buildDeps();
      deps.authenticationRepository.checkToken.mockResolvedValue(null);

      const service = createAuthenticationService(deps);

      await expect(service.logout('invalidToken')).rejects.toThrow(
        InvariantError,
      );
    });

    it('deletes token from DB when refresh token is valid', async () => {
      const refreshToken = 'validRefreshToken';
      const deps = buildDeps();
      deps.authenticationRepository.checkToken.mockResolvedValue({
        token: refreshToken,
      } as never);

      const service = createAuthenticationService(deps);
      await service.logout(refreshToken);

      expect(deps.authenticationRepository.deleteToken).toHaveBeenCalledWith(
        refreshToken,
      );
    });
  });
});
