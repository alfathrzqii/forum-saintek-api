import { describe, expect, it, mock } from 'bun:test';
import jwt from 'jsonwebtoken';

process.env.ACCESS_TOKEN_KEY ??= 'test-access-secret';
process.env.REFRESH_TOKEN_KEY ??= 'test-refresh-secret';
process.env.DATABASE_URL ??=
  'postgresql://user:pass@localhost:5432/forum_saintek_test';

const { config } = await import('../../src/config/index.ts');
const { AuthenticationError } = await import(
  '../../src/exceptions/AuthenticationError.ts'
);
const { AuthorizationError } = await import(
  '../../src/exceptions/AuthorizationError.ts'
);
const { signAccessToken, signRefreshToken } = await import(
  '../../src/utils/jwt.ts'
);
const { authenticateRequest } = await import(
  '../../src/api/middlewares/authenticationMiddleware.ts'
);
const { requireRole } = await import(
  '../../src/api/middlewares/roleMiddleware.ts'
);

const sampleUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'mhs@student.uin-suka.ac.id',
  username: 'mhs_keren',
  fullName: 'Mahasiswa Saintek',
  role: 'USER' as const,
  prodi: 'Informatika',
};

describe('M3 Auth & Role Middlewares Unit Test', () => {
  describe('authenticateRequest', () => {
    it('throws AuthenticationError when Authorization header is missing', async () => {
      const req = new Request('http://localhost/api/users/me');

      await expect(
        authenticateRequest(req, { findUserById: mock(async () => sampleUser) }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak ditemukan atau format salah'),
      );
    });

    it('throws AuthenticationError when Authorization header does not start with Bearer ', async () => {
      const req = new Request('http://localhost/api/users/me', {
        headers: { authorization: 'Basic abcdef' },
      });

      await expect(
        authenticateRequest(req, { findUserById: mock(async () => sampleUser) }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak ditemukan atau format salah'),
      );
    });

    it('throws AuthenticationError when Bearer header has no token (trimmed to Bearer)', async () => {
      const emptyReq = new Request('http://localhost/api/users/me', {
        headers: { authorization: 'Bearer ' },
      });
      await expect(
        authenticateRequest(emptyReq, {
          findUserById: mock(async () => sampleUser),
        }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak ditemukan atau format salah'),
      );
    });

    it('throws AuthenticationError when Bearer token is malformed or missing id', async () => {
      const badReq = new Request('http://localhost/api/users/me', {
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      await expect(
        authenticateRequest(badReq, {
          findUserById: mock(async () => sampleUser),
        }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak valid atau sudah kadaluarsa'),
      );

      const missingIdToken = jwt.sign(
        { role: 'USER', prodi: 'Informatika' },
        config.jwt.accessTokenKey,
        { algorithm: 'HS256' },
      );
      const missingIdReq = new Request('http://localhost/api/users/me', {
        headers: { authorization: `Bearer ${missingIdToken}` },
      });
      await expect(
        authenticateRequest(missingIdReq, {
          findUserById: mock(async () => sampleUser),
        }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak valid atau sudah kadaluarsa'),
      );
    });

    it('throws AuthenticationError when token is expired or signed with refresh key', async () => {
      const expiredToken = jwt.sign(
        { id: sampleUser.id, role: sampleUser.role, prodi: sampleUser.prodi },
        config.jwt.accessTokenKey,
        { algorithm: 'HS256', expiresIn: -5 },
      );
      const expiredReq = new Request('http://localhost/api/users/me', {
        headers: { authorization: `Bearer ${expiredToken}` },
      });

      await expect(
        authenticateRequest(expiredReq, {
          findUserById: mock(async () => sampleUser),
        }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak valid atau sudah kadaluarsa'),
      );

      const refreshToken = signRefreshToken({
        id: sampleUser.id,
        role: sampleUser.role,
        prodi: sampleUser.prodi,
      });
      const refreshReq = new Request('http://localhost/api/users/me', {
        headers: { authorization: `Bearer ${refreshToken}` },
      });

      await expect(
        authenticateRequest(refreshReq, {
          findUserById: mock(async () => sampleUser),
        }),
      ).rejects.toThrow(
        new AuthenticationError('Token tidak valid atau sudah kadaluarsa'),
      );
    });

    it('throws AuthenticationError for Ghost User when findUserById returns null', async () => {
      const token = signAccessToken({
        id: sampleUser.id,
        role: sampleUser.role,
        prodi: sampleUser.prodi,
      });
      const req = new Request('http://localhost/api/users/me', {
        headers: { authorization: `Bearer ${token}` },
      });
      const findUserById = mock(async () => null);

      await expect(
        authenticateRequest(req, { findUserById }),
      ).rejects.toThrow(
        new AuthenticationError(
          'User sudah tidak terdaftar atau akun telah dihapus',
        ),
      );
      expect(findUserById).toHaveBeenCalledWith(sampleUser.id);
    });

    it('returns AuthUser when access token is valid and user exists', async () => {
      const token = signAccessToken({
        id: sampleUser.id,
        role: sampleUser.role,
        prodi: sampleUser.prodi,
      });
      const req = new Request('http://localhost/api/users/me', {
        headers: { authorization: `Bearer ${token}` },
      });
      const findUserById = mock(async () => sampleUser);

      const result = await authenticateRequest(req, { findUserById });
      expect(result).toEqual(sampleUser);
      expect(findUserById).toHaveBeenCalledWith(sampleUser.id);
    });
  });

  describe('requireRole', () => {
    it('throws AuthorizationError (403) when user is missing, USER, or MODERATOR for ADMIN route', () => {
      expect(() => requireRole(null, ['ADMIN'])).toThrow(
        new AuthorizationError(
          'Akses ditolak: Anda tidak memiliki izin untuk tindakan ini',
        ),
      );
      expect(() => requireRole(sampleUser, ['ADMIN'])).toThrow(
        AuthorizationError,
      );
      expect(() =>
        requireRole({ ...sampleUser, role: 'MODERATOR' }, ['ADMIN']),
      ).toThrow(AuthorizationError);
    });

    it('passes when user has an allowed role', () => {
      expect(() =>
        requireRole({ ...sampleUser, role: 'ADMIN' }, ['ADMIN']),
      ).not.toThrow();
      expect(() =>
        requireRole({ ...sampleUser, role: 'MODERATOR' }, [
          'ADMIN',
          'MODERATOR',
        ]),
      ).not.toThrow();
    });
  });
});
